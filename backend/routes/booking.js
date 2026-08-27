const express = require('express');
const Joi = require('joi');
const Booking = require('../models/Booking');
const Ambulance = require('../models/Ambulance');
const User = require('../models/User');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const twilio = require('twilio');
const { sendEmail } = require('../utils/email');
const { autoAssignAmbulance } = require('../utils/auto-reassignment');

// Initialize Twilio client if credentials exist
let twilioClient = null;
if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
  try {
    twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  } catch (err) {
    console.error('Failed to initialize Twilio client:', err);
  }
}

const router = express.Router();

// Get all active hospitals (public endpoint for patient page)
router.get('/hospitals', async (req, res) => {
  try {
    const { latitude, longitude, radius = 50 } = req.query;

    const hospitals = await User.find({
      role: 'hospital',
      isApproved: true,
      isActive: true
    })
    .select('hospitalName hospitalAddress hospitalLocation capacity specialties phone email')
    .sort({ hospitalName: 1 });

    let hospitalsWithDistance = hospitals.map(h => ({
      id: h._id,
      name: h.hospitalName,
      address: h.hospitalAddress,
      location: h.hospitalLocation,
      capacity: h.capacity,
      specialties: h.specialties,
      phone: h.phone,
      email: h.email
    }));

    // If location provided, calculate distances and filter by radius
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const maxRadius = parseFloat(radius);

      hospitalsWithDistance = hospitalsWithDistance
        .map(hospital => {
          if (!hospital.location) return null;
          
          const distance = calculateDistance(
            lat,
            lng,
            hospital.location.latitude,
            hospital.location.longitude
          );

          return { ...hospital, distance };
        })
        .filter(h => h && h.distance <= maxRadius)
        .sort((a, b) => a.distance - b.distance);
    }

    res.json({
      success: true,
      hospitals: hospitalsWithDistance
    });
  } catch (error) {
    console.error('Get hospitals error:', error);
    res.status(500).json({ error: 'Failed to fetch hospitals' });
  }
});

// Get nearby available ambulances (public endpoint for patient page)
router.get('/nearby-ambulances', async (req, res) => {
  try {
    const { latitude, longitude, radius = 50, includeBusy = '0' } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    const statusCondition = includeBusy === '1'
      ? { $in: ['available', 'busy'] }
      : 'available';

    const ambulances = await Ambulance.find({
      status: statusCondition,
      currentLocation: { $exists: true }
    }).populate('driverId', 'name phone isOnDuty isApproved isActive');

    // Calculate distances and filter by radius
    const nearbyAmbulances = ambulances
      .filter(amb => amb.driverId) // must have a driver
      .map(ambulance => {
        const distance = calculateDistance(
          lat,
          lng,
          ambulance.currentLocation.latitude,
          ambulance.currentLocation.longitude
        );

        return {
          id: ambulance._id,
          vehicleNumber: ambulance.vehicleNumber,
          type: ambulance.type,
          location: ambulance.currentLocation,
          status: ambulance.status,
          distance: distance,
          driver: {
            name: ambulance.driverId.name,
            phone: ambulance.driverId.phone,
            isOnDuty: ambulance.driverId.isOnDuty
          }
        };
      })
      .filter(amb => amb.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    res.json({
      success: true,
      ambulances: nearbyAmbulances,
      count: nearbyAmbulances.length
    });
  } catch (error) {
    console.error('Get nearby ambulances error:', error);
    res.status(500).json({ error: 'Failed to fetch nearby ambulances' });
  }
});

// Get all registered ambulance drivers (public endpoint)
router.get('/drivers', async (req, res) => {
  try {
    const drivers = await User.find({
      role: 'driver',
      isActive: true,
      isApproved: true
    })
    .select('name phone email isOnDuty ambulanceId')
    .populate('ambulanceId', 'vehicleNumber status type currentLocation');

    const driverList = drivers.map(driver => ({
      id: driver._id,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      isOnDuty: driver.isOnDuty,
      ambulance: driver.ambulanceId ? {
        id: driver.ambulanceId._id,
        vehicleNumber: driver.ambulanceId.vehicleNumber,
        status: driver.ambulanceId.status,
        type: driver.ambulanceId.type,
        location: driver.ambulanceId.currentLocation
      } : null
    }));

    res.json({ success: true, drivers: driverList, total: driverList.length });
  } catch (error) {
    console.error('Get drivers error:', error);
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// Force all ambulances and drivers into available state (quick recovery endpoint)
router.patch('/reset-all-ambulances', async (req, res) => {
  try {
    await Ambulance.updateMany({}, { status: 'available' });
    await User.updateMany({ role: 'driver' }, { isActive: true, isApproved: true, isOnDuty: true });

    // Optionally assign driver to the ambulance if both exist in equal count
    const allAmbulances = await Ambulance.find().populate('driverId');
    const freeDrivers = await User.find({ role: 'driver', isOnDuty: true, ambulanceId: { $exists: false } });

    for (let [index, amb] of allAmbulances.entries()) {
      if (!amb.driverId && freeDrivers[index]) {
        amb.driverId = freeDrivers[index]._id;
        await amb.save();
        freeDrivers[index].ambulanceId = amb._id;
        await freeDrivers[index].save();
      }
    }

    res.json({ success: true, message: 'All ambulances set available and drivers on duty' });
  } catch (error) {
    console.error('Reset all ambulances error:', error);
    res.status(500).json({ error: 'Failed to reset ambulances' });
  }
});

// Validation schema for booking (supports simplified flow)
const bookingSchema = Joi.object({
  callerType: Joi.string().valid('patient', 'bystander').default('patient'),
  patientCount: Joi.number().min(1).max(10).default(1),
  incidentType: Joi.string().min(2).max(50).default('medical'),
  preferredHospitalId: Joi.string().optional(), // Allow hospital selection
  patientInfo: Joi.object({
    name: Joi.string().min(2).optional(),
    phone: Joi.string().pattern(/^[0-9]{10}$/).optional(),
    age: Joi.number().min(0).max(150),
    gender: Joi.string().valid('male', 'female', 'other')
  }).optional(),
  emergencyDetails: Joi.object({
    description: Joi.string().min(5).default('Emergency reported'),
    symptoms: Joi.array().items(Joi.string()),
    isConscious: Joi.boolean().default(true)
  }).optional(),
  location: Joi.object({
    pickup: Joi.object({
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required(),
      address: Joi.string().required(),
      landmark: Joi.string()
    }).required()
  }).required()
});

// Create new booking (public endpoint)
router.post('/create', async (req, res) => {
  try {
    const { error } = bookingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const payload = req.body || {};
    const patientInfo = payload.patientInfo || { name: 'Unknown', phone: '' };
    const emergencyDetails = payload.emergencyDetails || {
      description: `Reported ${payload.incidentType || 'emergency'}`
    };
    // Note: No severity assigned yet - will be determined by nurse/driver after arrival

    const booking = new Booking({
      patientInfo,
      emergencyDetails,
      location: payload.location,
      callerType: payload.callerType || 'patient',
      patientCount: payload.patientCount || 1,
      incidentType: payload.incidentType || 'medical',
      preferredHospitalId: payload.preferredHospitalId // Store preferred hospital
    });
    
    // Save booking
    const savedBooking = await booking.save();
    console.log(`✓ Booking saved: ${savedBooking.bookingId}`);

    // Add initial timeline entry
    savedBooking.timeline.push({
      status: 'pending',
      timestamp: new Date(),
      notes: `Booking created (caller: ${savedBooking.callerType}, patients: ${savedBooking.patientCount})`
    });

    await savedBooking.save();
    console.log(`✓ Timeline added for booking: ${savedBooking.bookingId}`);
    
    // Send admin notification email for every booking
    try {
      const { sendEmail } = require('../utils/email');
      console.log('📧 Sending admin notification email...');
      
      const emailResult = await sendEmail({
        to: 'mjv3140@gmail.com',
        subject: `🚨 NEW AMBULANCE BOOKING - ${savedBooking.bookingId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">🚑 NEW EMERGENCY BOOKING</h1>
            </div>
            
            <div style="padding: 30px; background: #f8fafc;">
              <div style="background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid #dc2626;">
                <h2 style="color: #1e293b; margin-top: 0;">Booking Details</h2>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 0; font-weight: 600; color: #64748b;">Booking ID:</td>
                    <td style="padding: 12px 0; color: #1e293b; font-weight: 700;">${savedBooking.bookingId}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 0; font-weight: 600; color: #64748b;">Patient Name:</td>
                    <td style="padding: 12px 0; color: #1e293b;">${savedBooking.patientInfo.name || 'Not provided'}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 0; font-weight: 600; color: #64748b;">Patient Phone:</td>
                    <td style="padding: 12px 0; color: #1e293b;">${savedBooking.patientInfo.phone || 'Not provided'}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 0; font-weight: 600; color: #64748b;">Incident Type:</td>
                    <td style="padding: 12px 0; color: #dc2626; font-weight: 600; text-transform: uppercase;">${savedBooking.incidentType || 'Emergency'}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 0; font-weight: 600; color: #64748b;">Pickup Location:</td>
                    <td style="padding: 12px 0; color: #1e293b;">${savedBooking.location.pickup.address || 'Location provided'}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 0; font-weight: 600; color: #64748b;">Coordinates:</td>
                    <td style="padding: 12px 0; color: #1e293b;">${savedBooking.location.pickup.latitude}, ${savedBooking.location.pickup.longitude}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 0; font-weight: 600; color: #64748b;">Status:</td>
                    <td style="padding: 12px 0; color: #f59e0b; font-weight: 600;">${savedBooking.status.toUpperCase()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; font-weight: 600; color: #64748b;">Time:</td>
                    <td style="padding: 12px 0; color: #1e293b;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  </tr>
                </table>
              </div>
              
              <div style="background: #fef3c7; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
                <p style="margin: 0; color: #92400e; font-weight: 600;">
                  ⚠️ This is an emergency booking. Immediate action required.
                </p>
              </div>
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="http://${process.env.SERVER_IP || 'localhost'}:5173/admin-dashboard.html" 
                   style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
                          color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; 
                          font-weight: 600; font-size: 16px;">
                  View in Admin Dashboard
                </a>
              </div>
            </div>
            
            <div style="background: #1e293b; padding: 20px; text-align: center;">
              <p style="color: #94a3b8; margin: 0; font-size: 14px;">
                Smart Ambulance System - Admin Notification
              </p>
              <p style="color: #64748b; margin: 8px 0 0 0; font-size: 12px;">
                This is an automated notification. Do not reply to this email.
              </p>
            </div>
          </div>
        `
      });
      
      if (emailResult.skipped) {
        console.log('⚠️ Admin email not sent - email not configured');
      } else {
        console.log('✅ Admin notification email sent to mjv3140@gmail.com');
      }
    } catch (emailError) {
      console.error('❌ Admin email error:', emailError.message);
      // Don't fail booking if email fails
    }
    
    // Send SMS based on pickup location
    try {
      const { sendLocationAlert } = require('../utils/sms');
      const pickupAddress = (savedBooking.location?.pickup?.address || '').toLowerCase();
      const SERVER_IP = process.env.SERVER_IP || 'localhost';

      // Location-based routing: match keywords in the address
      const locationRouting = [
        { keywords: ['vandalur', 'vandalore'], number: '7200336447', name: 'Marten Jothi Victor', email: 'mjv3140@gmail.com' },
        { keywords: ['chengalpattu', 'chengalpet'], number: '6379228382', name: 'Mohamed Anas', email: 'm.mohamedanas2004@gmail.com' }
      ];

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚨 SENDING LOCATION-BASED SMS + EMAIL');
      console.log(`📍 Location: ${pickupAddress}`);
      console.log(`🆔 Booking ID: ${savedBooking.bookingId}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const dashboardLink = `http://${SERVER_IP}:5173/driver-dashboard.html?booking=${savedBooking.bookingId}`;

      const sendDriverEmail = async (route) => {
        try {
          await sendEmail({
            to: route.email,
            subject: `🚨 NEW EMERGENCY - ${savedBooking.bookingId} | ${savedBooking.location.pickup.address}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0;">🚑 NEW EMERGENCY BOOKING</h1>
                </div>
                <div style="padding: 30px; background: #f8fafc;">
                  <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #dc2626; margin-bottom: 20px;">
                    <h2 style="color: #1e293b; margin-top: 0;">Hi ${route.name}, you have a new booking!</h2>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Booking ID:</td>
                        <td style="padding: 10px 0; font-weight: 700; color: #1e293b;">${savedBooking.bookingId}</td>
                      </tr>
                      <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Pickup Location:</td>
                        <td style="padding: 10px 0; color: #dc2626; font-weight: 600;">${savedBooking.location.pickup.address}</td>
                      </tr>
                      <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Incident Type:</td>
                        <td style="padding: 10px 0; color: #1e293b;">${savedBooking.incidentType || 'Emergency'}</td>
                      </tr>
                      <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Patient:</td>
                        <td style="padding: 10px 0; color: #1e293b;">${savedBooking.patientInfo?.name || 'Unknown'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Time:</td>
                        <td style="padding: 10px 0; color: #1e293b;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                      </tr>
                    </table>
                  </div>
                  <div style="text-align: center; margin-top: 20px;">
                    <a href="${dashboardLink}" 
                       style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
                              color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px;
                              font-weight: 700; font-size: 18px; letter-spacing: 0.5px;">
                      🚑 OPEN DRIVER DASHBOARD & ACCEPT
                    </a>
                  </div>
                  <p style="text-align:center; color:#64748b; margin-top:16px; font-size:13px;">
                    Tap the button above on your phone to open the dashboard and accept this booking.
                  </p>
                </div>
              </div>
            `
          });
          console.log(`✅ Driver email sent to ${route.name} (${route.email})`);
        } catch (emailErr) {
          console.error(`❌ Driver email failed to ${route.name}:`, emailErr.message);
        }
      };

      let matched = false;
      for (const route of locationRouting) {
        if (route.keywords.some(kw => pickupAddress.includes(kw))) {
          const smsResult = await sendLocationAlert(route.number, savedBooking.location.pickup.address, savedBooking.bookingId);
          if (smsResult.success) {
            console.log(`✅ SMS sent to ${route.name} (+91${route.number}) for location: ${pickupAddress}`);
          } else {
            console.warn(`⚠️ SMS failed to ${route.name} (+91${route.number}):`, smsResult.error);
          }
          await sendDriverEmail(route);
          matched = true;
          break;
        }
      }

      // If no location matched, send to both as fallback
      if (!matched) {
        console.log('⚠️ No location match found — sending to both drivers as fallback');
        for (const route of locationRouting) {
          const smsResult = await sendLocationAlert(route.number, savedBooking.location.pickup.address, savedBooking.bookingId);
          if (smsResult.success) {
            console.log(`✅ SMS sent to ${route.name} (+91${route.number})`);
          } else {
            console.warn(`⚠️ SMS failed to ${route.name} (+91${route.number}):`, smsResult.error);
          }
          await sendDriverEmail(route);
        }
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } catch (smsError) {
      console.error('SMS notification error:', smsError.message);
    }

    // Emit real-time event for new booking
    const io = req.app.get('io');
    io.emit('new-booking', {
      bookingId: savedBooking.bookingId,
      severity: savedBooking.emergencyDetails.severity,
      location: savedBooking.location.pickup,
      patientName: savedBooking.patientInfo.name
    });

    // Try to auto-assign ambulance (in background, don't block response)
    autoAssignAmbulance(savedBooking, io).catch(err => {
      console.error(`Auto-assign error for ${savedBooking.bookingId}:`, err);
      console.error('Stack trace:', err.stack);
    });

    // Send confirmation SMS to patient if phone provided
    const patientPhone = savedBooking.patientInfo?.phone;
    if (patientPhone && patientPhone.length === 10) {
      try {
        const { sendSMS } = require('../utils/sms');
        await sendSMS(patientPhone, `✅ Ambulance Booked!\n\nBooking ID: ${savedBooking.bookingId}\nPickup: ${savedBooking.location.pickup.address}\n\nAn ambulance has been dispatched. Stay calm and stay at your location.\n\nTrack: http://${process.env.SERVER_IP || 'localhost'}:5173/patient-booking.html?track=${savedBooking.bookingId}`);
        console.log(`✅ Confirmation SMS sent to patient +91${patientPhone}`);
      } catch(e) { console.warn('Patient SMS failed:', e.message); }
    }

    res.status(201).json({
      bookingId: savedBooking.bookingId,
      status: savedBooking.status,
      message: 'Booking created successfully'
    });
  } catch (error) {
    console.error('Create booking error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Quick booking endpoint (minimal input to avoid delays)
router.post('/quick', async (req, res) => {
  try {
    const quickSchema = Joi.object({
      name: Joi.string().min(2).required(),
      phone: Joi.string().pattern(/^[0-9]{10}$/).required(),
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required(),
      severity: Joi.number().min(1).max(5).default(5),
      age: Joi.number().min(0).max(150).optional(),
      gender: Joi.string().valid('male', 'female', 'other').optional()
    });

    const { error } = quickSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { name, phone, latitude, longitude, severity, age, gender } = req.body;

    const booking = new Booking({
      patientInfo: { name, phone, age, gender },
      emergencyDetails: { severity, description: 'Quick booking' },
      location: { pickup: { latitude, longitude, address: 'Current location' } }
    });

    await booking.save();

    booking.timeline.push({ status: 'pending', timestamp: new Date(), notes: 'Quick booking created' });
    await booking.save();

    const io = req.app.get('io');
    io.emit('new-booking', {
      bookingId: booking.bookingId,
      severity: booking.emergencyDetails.severity,
      location: booking.location.pickup,
      patientName: booking.patientInfo.name
    });

    await autoAssignAmbulance(booking, io);

    res.status(201).json({ bookingId: booking.bookingId, status: booking.status });
  } catch (err) {
    console.error('Quick booking error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get booking details (public endpoint with booking ID)
router.get('/:bookingId', async (req, res) => {
  try {
    console.log(`Fetching booking: ${req.params.bookingId}`);
    const booking = await Booking.findOne({ bookingId: req.params.bookingId })
      .populate('ambulanceId')
      .populate('driverId', 'name phone email currentLocation')
      .populate('location.destination.hospitalId', 'hospitalName hospitalAddress hospitalLocation phone email');

    if (!booking) {
      console.error(`Booking not found: ${req.params.bookingId}`);
      return res.status(404).json({ error: 'Booking not found' });
    }

    console.log(`✓ Booking found: ${req.params.bookingId}`);
    res.json({ booking });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// In-memory simulators for demo tracking
const simulators = {};

// Start simulation for a booking (demo only)
router.post('/:bookingId/simulate', async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (simulators[bookingId]) {
      return res.json({ message: 'Simulation already running' });
    }

    // Choose start location: if any available ambulance use that, otherwise offset from pickup
    let start = null;
    const ambulance = await Ambulance.findOne({ status: 'available' });
    if (ambulance && ambulance.currentLocation) {
      start = {
        latitude: ambulance.currentLocation.latitude,
        longitude: ambulance.currentLocation.longitude
      };
    } else {
      // offset start by ~0.02 degrees
      start = {
        latitude: (booking.location.pickup.latitude || 13.0827) + 0.02,
        longitude: (booking.location.pickup.longitude || 80.2707) + 0.02
      };
    }

    // Destination is pickup, then optionally hospital destination
    const pickup = {
      latitude: booking.location.pickup.latitude,
      longitude: booking.location.pickup.longitude
    };

    const hospital = booking.location.destination && booking.location.destination.latitude
      ? { latitude: booking.location.destination.latitude, longitude: booking.location.destination.longitude }
      : null;

    // Simple linear simulator
    let phase = 0; // 0 -> to pickup, 1 -> to hospital
    let from = start;
    let to = pickup;
    const steps = 60; // total steps per leg
    let step = 0;

    const io = req.app.get('io');

    const tick = () => {
      const t = step / steps;
      const lat = from.latitude + (to.latitude - from.latitude) * t;
      const lng = from.longitude + (to.longitude - from.longitude) * t;

      // Emit location to booking room
      io.to(`booking-${bookingId}`).emit('ambulance-location', {
        bookingId,
        latitude: lat,
        longitude: lng,
        phase: phase === 0 ? 'to-pickup' : 'to-hospital',
        timestamp: new Date()
      });

      // occasional traffic update
      if (Math.random() < 0.05) {
        io.to(`booking-${bookingId}`).emit('traffic-update', {
          location: { latitude: lat + 0.0005, longitude: lng + 0.0005 },
          state: ['green', 'yellow', 'red'][Math.floor(Math.random() * 3)]
        });
      }

      step++;
      if (step > steps) {
        if (phase === 0 && hospital) {
          phase = 1;
          from = pickup;
          to = hospital;
          step = 0;
        } else {
          // finished simulation, stop
          clearInterval(simulators[bookingId].interval);
          delete simulators[bookingId];
        }
      }
    };

    const interval = setInterval(tick, 1000);
    simulators[bookingId] = { interval };

    return res.json({ message: 'Simulation started' });
  } catch (error) {
    console.error('Start simulation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel booking (public, within 2 min of creation)
router.patch('/:bookingId/cancel', async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const ageMinutes = (Date.now() - new Date(booking.createdAt).getTime()) / 60000;
    if (ageMinutes > 2) return res.status(400).json({ error: 'Cannot cancel after 2 minutes' });
    if (['en-route','arrived','picked-up','transporting','completed'].includes(booking.status)) {
      return res.status(400).json({ error: 'Ambulance already dispatched' });
    }

    booking.status = 'cancelled';
    booking.timeline.push({ status: 'cancelled', timestamp: new Date(), notes: 'Cancelled by patient' });
    await booking.save();

    // Free up ambulance
    if (booking.ambulanceId) {
      await Ambulance.findByIdAndUpdate(booking.ambulanceId, { status: 'available' });
    }

    const io = req.app.get('io');
    io.emit('booking-update', { bookingId: booking.bookingId, status: 'cancelled' });

    res.json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Patient feedback endpoint
router.post('/:bookingId/feedback', async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    booking.feedback = { rating, comment: comment || '', submittedAt: new Date() };
    await booking.save();

    console.log(`⭐ Feedback received for ${booking.bookingId}: ${rating}/5 — "${comment}"`);
    res.json({ success: true, message: 'Feedback saved' });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Diagnostic endpoint - list recent bookings
router.get('/diagnostic/recent', async (req, res) => {
  try {
    const recent = await Booking.find().sort({ createdAt: -1 }).limit(5).select('bookingId status createdAt');
    res.json({ recent, count: recent.length });
  } catch (error) {
    console.error('Diagnostic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all bookings (admin only)
router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = status ? { status } : {};

    const bookings = await Booking.find(filter)
      .populate('ambulanceId')
      .populate('driverId', 'name phone')
      .populate('location.destination.hospitalId', 'hospitalName hospitalAddress')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Booking.countDocuments(filter);

    res.json({
      bookings,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver's assigned bookings
router.get('/driver/assigned', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const bookings = await Booking.find({
      driverId: req.user.userId,
      status: { $in: ['assigned', 'en-route', 'arrived', 'transporting'] }
    })
    .populate('location.destination.hospitalId', 'hospitalName hospitalAddress phone')
    .sort({ createdAt: -1 });

    res.json({ bookings });
  } catch (error) {
    console.error('Get driver bookings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept booking (driver only)
router.patch('/:bookingId/accept', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({ error: 'Booking is not available for acceptance' });
    }

    // Get driver's ambulance
    const driver = await User.findById(req.user.userId).populate('ambulanceId');
    if (!driver.ambulanceId) {
      return res.status(400).json({ error: 'No ambulance assigned to driver' });
    }

    // Update booking
    booking.status = 'assigned';
    booking.driverId = req.user.userId;
    booking.ambulanceId = driver.ambulanceId._id;
    
    // Add timeline entry
    booking.timeline.push({
      status: 'assigned',
      timestamp: new Date(),
      notes: `Accepted by driver ${driver.name}`
    });

    // Calculate estimated arrival (simplified - in real app, use routing API)
    const estimatedMinutes = calculateEstimatedArrival(
      driver.currentLocation,
      booking.location.pickup
    );
    booking.estimatedArrival = new Date(Date.now() + estimatedMinutes * 60000);

    await booking.save();

    // Update ambulance status
    await Ambulance.findByIdAndUpdate(driver.ambulanceId._id, { status: 'busy' });

    // Emit real-time update
    const io = req.app.get('io');
    io.emit('booking-update', {
      bookingId: booking.bookingId,
      status: booking.status,
      driverId: booking.driverId,
      ambulanceId: booking.ambulanceId,
      estimatedArrival: booking.estimatedArrival
    });

    res.json({ 
      message: 'Booking accepted successfully',
      booking: {
        bookingId: booking.bookingId,
        status: booking.status,
        estimatedArrival: booking.estimatedArrival
      }
    });
  } catch (error) {
    console.error('Accept booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update booking status (driver only)
router.patch('/:bookingId/status', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const { status, notes, location } = req.body;
    const validStatuses = ['en-route', 'arrived', 'transporting', 'completed'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const booking = await Booking.findOne({ 
      bookingId: req.params.bookingId,
      driverId: req.user.userId
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found or not assigned to you' });
    }

    // Update booking status
    booking.status = status;
    
    // Add timeline entry
    booking.timeline.push({
      status,
      timestamp: new Date(),
      location,
      notes
    });

    // Set completion time if completed
    if (status === 'completed') {
      booking.completedAt = new Date();
      
      // Make ambulance available again
      await Ambulance.findByIdAndUpdate(booking.ambulanceId, { status: 'available' });
    }

    // Set actual arrival time if arrived
    if (status === 'arrived' && !booking.actualArrival) {
      booking.actualArrival = new Date();
    }

    await booking.save();

    // Emit real-time update
    const io = req.app.get('io');
    io.emit('booking-update', {
      bookingId: booking.bookingId,
      status: booking.status,
      timeline: booking.timeline
    });

    res.json({ 
      message: 'Status updated successfully',
      booking: {
        bookingId: booking.bookingId,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Driver report after pickup (injury/state details) - PUBLIC endpoint
router.patch('/:bookingId/report', async (req, res) => {
  try {
    const reportSchema = Joi.object({
      criticalness: Joi.string().valid('low', 'moderate', 'critical', 'life-threatening').required(),
      injuryDetails: Joi.string().min(5).max(1000).required(),
      notes: Joi.string().max(1000).allow('').optional()
    });

    const { error } = reportSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const booking = await Booking.findOne({
      bookingId: req.params.bookingId
    })
    .populate('driverId', 'name phone')
    .populate('ambulanceId', 'vehicleNumber type')
    .populate('location.destination.hospitalId', 'hospitalName hospitalAddress email');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    booking.driverReport = {
      criticalness: req.body.criticalness,
      injuryDetails: req.body.injuryDetails,
      notes: req.body.notes || '',
      reportedAt: new Date(),
      reportedBy: req.user?.userId || null
    };

    // Ensure status reflects transport
    if (booking.status === 'arrived') {
      booking.status = 'transporting';
    } else if (booking.status !== 'transporting' && booking.status !== 'completed') {
      booking.status = 'en-route'; // Assume ambulance is en-route when report comes in
    }

    booking.timeline.push({
      status: 'driver-report',
      timestamp: new Date(),
      notes: `Medical report submitted: ${req.body.criticalness}`
    });

    await booking.save();

    const hospital = await resolveHospitalForNotification(booking);
    let emailResult = { skipped: true };

    if (hospital && hospital.email) {
      const subject = `Incoming Ambulance ${booking.bookingId} - ${req.body.criticalness.toUpperCase()}`;
      const text = buildHospitalEmailText(booking, hospital);
      const html = buildHospitalEmailHtml(booking, hospital);
      try {
        emailResult = await sendEmail({ to: hospital.email, subject, text, html });
      } catch (emailError) {
        console.error('Email send failed for driver report:', emailError.message || emailError);
        emailResult = { skipped: true, error: emailError?.message || 'Email send failed' };
      }
    }

    // Emit real-time update
    const io = req.app.get('io');
    io.emit('booking-update', {
      bookingId: booking.bookingId,
      status: booking.status,
      driverReport: booking.driverReport
    });

    res.json({
      message: 'Medical report submitted successfully',
      hospitalNotified: !!(hospital && hospital.email && !emailResult?.skipped),
      bookingId: booking.bookingId,
      emailSkipped: !!emailResult?.skipped
    });
  } catch (error) {
    console.error('Driver report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel booking
router.patch('/:bookingId/cancel', async (req, res) => {
  try {
    const { reason, cancelledBy } = req.body;
    
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (['completed', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({ error: 'Booking cannot be cancelled' });
    }

    // Update booking
    booking.status = 'cancelled';
    booking.cancelledBy = cancelledBy || 'patient';
    booking.cancellationReason = reason;
    
    // Add timeline entry
    booking.timeline.push({
      status: 'cancelled',
      timestamp: new Date(),
      notes: `Cancelled by ${cancelledBy}: ${reason}`
    });

    await booking.save();

    // Make ambulance available if it was assigned
    if (booking.ambulanceId) {
      await Ambulance.findByIdAndUpdate(booking.ambulanceId, { status: 'available' });
    }

    // Emit real-time update
    const io = req.app.get('io');
    io.emit('booking-update', {
      bookingId: booking.bookingId,
      status: booking.status
    });

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function calculateEstimatedArrival(driverLocation, pickupLocation) {
  if (!driverLocation) return 15; // Default 15 minutes
  
  const distance = calculateDistance(
    driverLocation.latitude,
    driverLocation.longitude,
    pickupLocation.latitude,
    pickupLocation.longitude
  );
  
  // Assume average speed of 40 km/h in city traffic
  return Math.ceil(distance / 40 * 60);
}

async function resolveHospitalForNotification(booking) {
  try {
    if (booking.location?.destination?.hospitalId) {
      if (booking.location.destination.hospitalId.email) {
        return booking.location.destination.hospitalId;
      }
      const hospital = await User.findById(booking.location.destination.hospitalId);
      return hospital;
    }

    const pickup = booking.location?.pickup;
    if (!pickup) return null;

    const hospitals = await User.find({ role: 'hospital', isActive: true });
    if (!hospitals.length) return null;

    let nearest = null;
    let minDistance = Infinity;
    hospitals.forEach((hospital) => {
      if (!hospital.hospitalLocation) return;
      const distance = calculateDistance(
        pickup.latitude,
        pickup.longitude,
        hospital.hospitalLocation.latitude,
        hospital.hospitalLocation.longitude
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = hospital;
      }
    });

    return nearest;
  } catch (error) {
    console.error('Resolve hospital error:', error);
    return null;
  }
}

function buildHospitalEmailText(booking, hospital) {
  const driverName = booking.driverId?.name || 'Assigned driver';
  const ambulanceNo = booking.ambulanceId?.vehicleNumber || booking.ambulanceId?.type || 'Ambulance';
  return [
    `Incoming ambulance alert (${booking.bookingId})`,
    `Hospital: ${hospital.hospitalName || hospital.name || 'Nearest Hospital'}`,
    `Pickup: ${booking.location?.pickup?.address || 'Unknown location'}`,
    `Incident: ${booking.incidentType || 'medical'}`,
    `Patients: ${booking.patientCount || 1}`,
    `Criticalness: ${booking.driverReport?.criticalness || 'unknown'}`,
    `Injury details: ${booking.driverReport?.injuryDetails || ''}`,
    `Notes: ${booking.driverReport?.notes || ''}`,
    `Driver: ${driverName}`,
    `Ambulance: ${ambulanceNo}`
  ].join('\n');
}

function buildHospitalEmailHtml(booking, hospital) {
  const driverName = booking.driverId?.name || 'Assigned driver';
  const ambulanceNo = booking.ambulanceId?.vehicleNumber || booking.ambulanceId?.type || 'Ambulance';
  return `
    <div style="font-family: Arial, sans-serif; color:#111827;">
      <h2>Incoming Ambulance Alert</h2>
      <p><strong>Booking:</strong> ${booking.bookingId}</p>
      <p><strong>Hospital:</strong> ${hospital.hospitalName || hospital.name || 'Nearest Hospital'}</p>
      <p><strong>Pickup:</strong> ${booking.location?.pickup?.address || 'Unknown location'}</p>
      <p><strong>Incident:</strong> ${booking.incidentType || 'medical'}</p>
      <p><strong>Patients:</strong> ${booking.patientCount || 1}</p>
      <p><strong>Criticalness:</strong> ${booking.driverReport?.criticalness || 'unknown'}</p>
      <p><strong>Injury Details:</strong> ${booking.driverReport?.injuryDetails || ''}</p>
      <p><strong>Notes:</strong> ${booking.driverReport?.notes || ''}</p>
      <p><strong>Driver:</strong> ${driverName}</p>
      <p><strong>Ambulance:</strong> ${ambulanceNo}</p>
    </div>
  `;
}

// Get driver's current trip
router.get('/driver/current', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      driverId: req.user.userId,
      status: { $in: ['assigned', 'en-route', 'arrived', 'transporting'] }
    })
    .populate('ambulanceId', 'vehicleNumber type')
    .populate('location.destination.hospitalId', 'hospitalName hospitalAddress')
    .sort({ createdAt: -1 });

    if (!booking) {
      return res.status(404).json({ message: 'No active trip' });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Get current trip error:', error);
    res.status(500).json({ error: 'Failed to get current trip' });
  }
});

// Get driver's trip history
router.get('/driver/history', authenticateToken, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const bookings = await Booking.find({
      driverId: req.user.userId,
      status: { $in: ['completed', 'cancelled'] }
    })
    .populate('ambulanceId', 'vehicleNumber type')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error('Get trip history error:', error);
    res.status(500).json({ error: 'Failed to get trip history' });
  }
});

// Update booking status (driver only)
router.patch('/:bookingId/status', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    const booking = await Booking.findOne({ bookingId });
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify driver is assigned to this booking
    if (booking.driverId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to update this booking' });
    }

    // Update status
    booking.status = status;
    
    // Add timeline entry
    booking.timeline.push({
      status,
      timestamp: new Date(),
      notes: `Status updated by driver`
    });

    // Set completion time if completed
    if (status === 'completed') {
      booking.completedAt = new Date();
    }

    await booking.save();

    console.log(`✓ Booking ${bookingId} status updated to: ${status}`);

    res.json({
      success: true,
      message: 'Status updated successfully',
      booking
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
