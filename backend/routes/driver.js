const express = require('express');
const Booking = require('../models/Booking');
const Ambulance = require('../models/Ambulance');
const User = require('../models/User');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { cancelReassignmentTimer } = require('../utils/auto-reassignment');

const router = express.Router();

// Get driver's current active booking
router.get('/current-booking', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const driver = await User.findById(req.user.userId).populate('ambulanceId');
    
    if (!driver || !driver.ambulanceId) {
      return res.status(404).json({ error: 'Driver or ambulance not found' });
    }

    // Find any active booking for this driver
    const booking = await Booking.findOne({
      driverId: driver._id,
      status: { $in: ['assigned', 'accepted', 'en-route', 'arrived', 'picked-up', 'transporting'] }
    })
    .populate('location.destination.hospitalId', 'hospitalName hospitalAddress hospitalLocation phone email')
    .sort({ createdAt: -1 });

    if (!booking) {
      return res.json({ 
        success: true, 
        hasActiveBooking: false,
        booking: null 
      });
    }

    res.json({
      success: true,
      hasActiveBooking: true,
      booking: {
        bookingId: booking.bookingId,
        _id: booking._id,
        status: booking.status,
        patientInfo: booking.patientInfo,
        emergencyDetails: booking.emergencyDetails,
        location: booking.location,
        estimatedArrival: booking.estimatedArrival,
        actualArrival: booking.actualArrival,
        distance: booking.distance,
        duration: booking.duration,
        driverAcceptance: booking.driverAcceptance,
        driverReport: booking.driverReport,
        createdAt: booking.createdAt,
        timeline: booking.timeline
      }
    });
  } catch (error) {
    console.error('Get current booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept booking request
router.post('/accept-booking/:bookingId', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if booking is assigned to this driver
    if (booking.driverId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'This booking is not assigned to you' });
    }

    // Check if booking is in assigned status
    if (booking.status !== 'assigned') {
      return res.status(400).json({ error: 'Booking cannot be accepted in current status' });
    }

    // Calculate response time
    const assignedTimeline = booking.timeline.find(t => t.status === 'assigned');
    const responseTime = assignedTimeline ? 
      Math.floor((Date.now() - assignedTimeline.timestamp.getTime()) / 1000) : 0;

    // Update booking
    booking.status = 'accepted';
    booking.driverAcceptance = {
      accepted: true,
      acceptedAt: new Date(),
      responseTime: responseTime
    };
    
    booking.timeline.push({
      status: 'accepted',
      timestamp: new Date(),
      notes: 'Driver accepted the booking'
    });

    await booking.save();

    // Cancel auto-reassignment timer since driver accepted
    cancelReassignmentTimer(booking.bookingId);

    // Mark last reassignment attempt as successful
    if (booking.reassignmentAttempts && booking.reassignmentAttempts.length > 0) {
      const lastAttempt = booking.reassignmentAttempts[booking.reassignmentAttempts.length - 1];
      lastAttempt.status = 'accepted';
      lastAttempt.acceptedAt = new Date();
      await booking.save();
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('booking-update', {
        bookingId: booking.bookingId,
        status: 'accepted',
        driverId: req.user.userId
      });
    }

    console.log(`✓ Driver ${req.user.userId} accepted booking ${booking.bookingId} in ${responseTime}s`);

    res.json({
      success: true,
      message: 'Booking accepted successfully',
      booking: {
        bookingId: booking.bookingId,
        status: booking.status,
        responseTime: responseTime
      }
    });
  } catch (error) {
    console.error('Accept booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start journey to patient
router.post('/start-journey/:bookingId', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.driverId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (booking.status !== 'accepted') {
      return res.status(400).json({ error: 'Booking must be accepted first' });
    }

    // Update booking status
    booking.status = 'en-route';
    booking.timeline.push({
      status: 'en-route',
      timestamp: new Date(),
      notes: 'Driver started journey to patient location'
    });

    await booking.save();

    // Update ambulance status
    await Ambulance.findByIdAndUpdate(booking.ambulanceId, { status: 'busy' });

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('booking-update', {
        bookingId: booking.bookingId,
        status: 'en-route'
      });
    }

    console.log(`✓ Driver started journey for booking ${booking.bookingId}`);

    res.json({
      success: true,
      message: 'Journey started',
      booking: {
        bookingId: booking.bookingId,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Start journey error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark arrived at patient location
router.post('/arrived/:bookingId', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    const booking = await Booking.findById(req.params.bookingId);
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.driverId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (booking.status !== 'en-route') {
      return res.status(400).json({ error: 'Invalid status transition' });
    }

    // Update booking
    booking.status = 'arrived';
    booking.actualArrival = new Date();
    booking.timeline.push({
      status: 'arrived',
      timestamp: new Date(),
      location: { latitude, longitude },
      notes: 'Driver arrived at patient location'
    });

    await booking.save();

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('booking-update', {
        bookingId: booking.bookingId,
        status: 'arrived',
        arrivedAt: booking.actualArrival
      });
    }

    console.log(`✓ Driver arrived at patient location for booking ${booking.bookingId}`);

    res.json({
      success: true,
      message: 'Marked as arrived',
      booking: {
        bookingId: booking.bookingId,
        status: booking.status,
        actualArrival: booking.actualArrival
      }
    });
  } catch (error) {
    console.error('Mark arrived error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark patient picked up
router.post('/pickup-patient/:bookingId', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.driverId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (booking.status !== 'arrived') {
      return res.status(400).json({ error: 'Must arrive at location first' });
    }

    // Update booking
    booking.status = 'picked-up';
    booking.timeline.push({
      status: 'picked-up',
      timestamp: new Date(),
      notes: 'Patient picked up by ambulance'
    });

    await booking.save();

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('booking-update', {
        bookingId: booking.bookingId,
        status: 'picked-up'
      });
    }

    console.log(`✓ Patient picked up for booking ${booking.bookingId}`);

    res.json({
      success: true,
      message: 'Patient picked up successfully',
      booking: {
        bookingId: booking.bookingId,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Pickup patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit patient criticalness report
router.post('/submit-report/:bookingId', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const { criticalness, severity, description, injuryDetails, vitalSigns } = req.body;
    
    // Validate criticalness
    const validCriticalness = ['low', 'moderate', 'critical', 'life-threatening'];
    if (!criticalness || !validCriticalness.includes(criticalness)) {
      return res.status(400).json({ error: 'Invalid criticalness level' });
    }

    // Validate severity (1-5 scale)
    if (!severity || severity < 1 || severity > 5) {
      return res.status(400).json({ error: 'Severity must be between 1 and 5' });
    }

    const booking = await Booking.findById(req.params.bookingId)
      .populate('location.destination.hospitalId', 'hospitalName email');
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.driverId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (booking.status !== 'picked-up') {
      return res.status(400).json({ error: 'Patient must be picked up first' });
    }

    // Update emergency details with assessed severity
    booking.emergencyDetails.severity = severity;
    booking.emergencyDetails.assessedBy = 'nurse'; // Nurse accompanying driver
    booking.emergencyDetails.assessedAt = new Date();

    // Update driver report
    booking.driverReport = {
      criticalness: criticalness,
      severity: severity, // Store severity in report too
      description: description || '',
      injuryDetails: injuryDetails || '',
      vitalSigns: vitalSigns || {},
      reportedAt: new Date(),
      reportedBy: req.user.userId,
      sentToHospital: true,
      sentAt: new Date()
    };

    // Update status to transporting
    booking.status = 'transporting';
    booking.timeline.push({
      status: 'transporting',
      timestamp: new Date(),
      notes: `Nurse assessment: Severity ${severity}/5, Criticalness: ${criticalness}`
    });

    await booking.save();

    // Emit real-time update to hospital
    const io = req.app.get('io');
    if (io && booking.location.destination.hospitalId) {
      io.emit('hospital-incoming', {
        hospitalId: booking.location.destination.hospitalId._id,
        booking: {
          bookingId: booking.bookingId,
          patientInfo: booking.patientInfo,
          severity: severity,
          criticalness: criticalness,
          description: description,
          injuryDetails: injuryDetails,
          estimatedArrival: booking.estimatedArrival
        }
      });
    }

    console.log(`✓ Nurse assessment submitted for booking ${booking.bookingId}: Severity ${severity}/5, Criticalness: ${criticalness}`);

    res.json({
      success: true,
      message: 'Assessment submitted and sent to hospital',
      booking: {
        bookingId: booking.bookingId,
        status: booking.status,
        severity: severity,
        driverReport: booking.driverReport
      }
    });
  } catch (error) {
    console.error('Submit report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete trip
router.post('/complete-trip/:bookingId', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .populate('driverId', 'name phone email')
      .populate('ambulanceId', 'vehicleNumber type')
      .populate('location.destination.hospitalId', 'hospitalName hospitalAddress email phone');

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.driverId._id.toString() !== req.user.userId) return res.status(403).json({ error: 'Unauthorized' });
    if (booking.status !== 'transporting') return res.status(400).json({ error: 'Invalid status for completion' });

    booking.status = 'completed';
    booking.completedAt = new Date();
    booking.timeline.push({ status: 'completed', timestamp: new Date(), notes: 'Patient delivered to hospital. Case closed.' });
    await booking.save();

    await Ambulance.findByIdAndUpdate(booking.ambulanceId, { status: 'available' });

    const io = req.app.get('io');
    if (io) io.emit('booking-update', { bookingId: booking.bookingId, status: 'completed', completedAt: booking.completedAt });

    console.log(`✓ Trip completed for booking ${booking.bookingId}`);

    // ── COMPLETION NOTIFICATIONS ──────────────────────────────────────────
    const { sendEmail } = require('../utils/email');
    const { sendSMS } = require('../utils/sms');
    const completedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const hospital = booking.location?.destination?.hospitalId;
    const driver = booking.driverId;
    const patient = booking.patientInfo;

    // 1. Email to driver — case closed
    if (driver?.email) {
      sendEmail({
        to: driver.email,
        subject: `✅ Trip Completed — ${booking.bookingId}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#16a34a;padding:24px;text-align:center;">
              <h1 style="color:white;margin:0;">✅ Trip Completed</h1>
            </div>
            <div style="padding:24px;background:#f8fafc;">
              <p>Hi ${driver.name}, your trip has been completed successfully.</p>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Booking ID:</td><td style="padding:8px 0;">${booking.bookingId}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Patient:</td><td style="padding:8px 0;">${patient?.name || 'Unknown'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Pickup:</td><td style="padding:8px 0;">${booking.location?.pickup?.address || 'N/A'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Hospital:</td><td style="padding:8px 0;">${hospital?.hospitalName || 'N/A'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Completed At:</td><td style="padding:8px 0;">${completedAt}</td></tr>
              </table>
              <p style="color:#16a34a;font-weight:600;margin-top:16px;">Case closed. Ambulance is now available for next booking.</p>
            </div>
          </div>`
      }).catch(e => console.warn('Driver completion email failed:', e.message));
    }

    // 2. Email to hospital — patient delivered
    if (hospital?.email) {
      sendEmail({
        to: hospital.email,
        subject: `🏥 Patient Delivered — ${booking.bookingId}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#3b82f6;padding:24px;text-align:center;">
              <h1 style="color:white;margin:0;">🏥 Patient Delivered</h1>
            </div>
            <div style="padding:24px;background:#f8fafc;">
              <p>A patient has been delivered to ${hospital.hospitalName}.</p>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Booking ID:</td><td style="padding:8px 0;">${booking.bookingId}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Patient:</td><td style="padding:8px 0;">${patient?.name || 'Unknown'} | ${patient?.phone || 'N/A'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Incident:</td><td style="padding:8px 0;">${booking.incidentType || 'Medical Emergency'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Criticalness:</td><td style="padding:8px 0;">${booking.driverReport?.criticalness || 'N/A'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Driver:</td><td style="padding:8px 0;">${driver?.name || 'N/A'} | ${booking.ambulanceId?.vehicleNumber || 'N/A'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-weight:600;">Delivered At:</td><td style="padding:8px 0;">${completedAt}</td></tr>
              </table>
            </div>
          </div>`
      }).catch(e => console.warn('Hospital completion email failed:', e.message));
    }

    // 3. SMS to driver — case closed
    if (driver?.phone) {
      sendSMS(driver.phone, `✅ Trip Completed!\n\nBooking: ${booking.bookingId}\nPatient delivered to ${hospital?.hospitalName || 'hospital'}\nTime: ${completedAt}\n\nCase closed. You are now available.`)
        .catch(e => console.warn('Driver completion SMS failed:', e.message));
    }

    // 4. SMS to patient — case closed
    if (patient?.phone && patient.phone.length === 10) {
      sendSMS(patient.phone, `✅ Your ambulance booking ${booking.bookingId} is complete.\nYou have been delivered to ${hospital?.hospitalName || 'the hospital'}.\nThank you for using our service.`)
        .catch(e => console.warn('Patient completion SMS failed:', e.message));
    }

    console.log(`✅ Completion notifications sent for ${booking.bookingId}`);

    res.json({
      success: true,
      message: 'Trip completed successfully',
      booking: { bookingId: booking.bookingId, status: booking.status, completedAt: booking.completedAt }
    });
  } catch (error) {
    console.error('Complete trip error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver statistics
router.get('/stats', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const driverId = req.user.userId;
    
    const totalTrips = await Booking.countDocuments({ driverId });
    const completedTrips = await Booking.countDocuments({ driverId, status: 'completed' });
    const activeTrip = await Booking.findOne({ 
      driverId, 
      status: { $in: ['assigned', 'accepted', 'en-route', 'arrived', 'picked-up', 'transporting'] }
    });

    // Calculate average response time
    const bookingsWithResponse = await Booking.find({
      driverId,
      'driverAcceptance.accepted': true
    }).select('driverAcceptance.responseTime');

    const avgResponseTime = bookingsWithResponse.length > 0 ?
      bookingsWithResponse.reduce((sum, b) => sum + (b.driverAcceptance.responseTime || 0), 0) / bookingsWithResponse.length :
      0;

    res.json({
      success: true,
      stats: {
        totalTrips,
        completedTrips,
        activeTrips: activeTrip ? 1 : 0,
        averageResponseTime: Math.round(avgResponseTime)
      }
    });
  } catch (error) {
    console.error('Get driver stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get trip history
router.get('/history', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const driverId = req.user.userId;

    const trips = await Booking.find({ driverId })
      .populate('location.destination.hospitalId', 'hospitalName hospitalAddress')
      .populate('ambulanceId', 'vehicleNumber type')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('bookingId patientInfo emergencyDetails status createdAt completedAt location driverReport driverAcceptance distance duration');

    const total = await Booking.countDocuments({ driverId });

    res.json({
      success: true,
      trips,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get trip history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update driver location
router.post('/update-location', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }
    
    // Update driver's current location
    await User.findByIdAndUpdate(req.user.userId, {
      currentLocation: {
        latitude,
        longitude,
        lastUpdated: new Date()
      }
    });
    
    // Update ambulance location
    const driver = await User.findById(req.user.userId);
    if (driver.ambulanceId) {
      await Ambulance.findByIdAndUpdate(driver.ambulanceId, {
        currentLocation: {
          latitude,
          longitude,
          lastUpdated: new Date()
        }
      });
    }
    
    // Emit location update to booking room
    const booking = await Booking.findOne({
      driverId: req.user.userId,
      status: { $in: ['assigned', 'accepted', 'en-route', 'arrived', 'picked-up', 'transporting'] }
    });
    
    if (booking) {
      const io = req.app.get('io');
      if (io) {
        io.to(`booking-${booking.bookingId}`).emit('ambulance-location', {
          bookingId: booking.bookingId,
          latitude,
          longitude,
          timestamp: new Date()
        });
      }
    }
    
    res.json({ success: true, message: 'Location updated' });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

module.exports = router;
