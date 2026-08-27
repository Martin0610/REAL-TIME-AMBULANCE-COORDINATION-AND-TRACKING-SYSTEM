const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const Ambulance = require('../models/Ambulance');
const Booking = require('../models/Booking');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Validation schema for location update
const locationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracy: Joi.number().min(0),
  heading: Joi.number().min(0).max(360),
  speed: Joi.number().min(0)
});

// Update driver/ambulance location
router.post('/update', authenticateToken, authorizeRoles('driver'), async (req, res) => {
  try {
    const { error } = locationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { latitude, longitude, accuracy, heading, speed } = req.body;

    // Update driver's current location
    const driver = await User.findByIdAndUpdate(
      req.user.userId,
      {
        currentLocation: {
          latitude,
          longitude,
          timestamp: new Date()
        }
      },
      { new: true }
    ).populate('ambulanceId');

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Update ambulance location
    if (driver.ambulanceId) {
      await Ambulance.findByIdAndUpdate(
        driver.ambulanceId._id,
        {
          currentLocation: {
            latitude,
            longitude,
            timestamp: new Date()
          }
        }
      );

      // Find active booking for this driver
      const activeBooking = await Booking.findOne({
        driverId: req.user.userId,
        status: { $in: ['assigned', 'en-route', 'arrived', 'transporting'] }
      });

      // Emit real-time location update
      const io = req.app.get('io');
      
      // Emit to tracking room
      io.to('tracking').emit('ambulance-location', {
        ambulanceId: driver.ambulanceId._id,
        driverId: req.user.userId,
        location: { latitude, longitude },
        timestamp: new Date(),
        heading,
        speed,
        bookingId: activeBooking ? activeBooking.bookingId : null
      });

      // Emit to specific booking room if there's an active booking
      if (activeBooking) {
        io.to(`booking-${activeBooking.bookingId}`).emit('ambulance-location', {
          ambulanceId: driver.ambulanceId._id,
          location: { latitude, longitude },
          timestamp: new Date(),
          heading,
          speed,
          estimatedArrival: activeBooking.estimatedArrival
        });

        // Update ETA if en-route
        if (activeBooking.status === 'en-route') {
          const updatedETA = calculateUpdatedETA(
            { latitude, longitude },
            activeBooking.location.pickup
          );
          
          if (updatedETA) {
            activeBooking.estimatedArrival = new Date(Date.now() + updatedETA * 60000);
            await activeBooking.save();
          }
        }
      }
    }

    res.json({ 
      message: 'Location updated successfully',
      location: { latitude, longitude, timestamp: new Date() }
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get nearby ambulances (public endpoint for emergency booking)
router.post('/nearby-ambulances', async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.body; // radius in km

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    // Find available ambulances within radius
    const ambulances = await Ambulance.find({
      status: 'available',
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: radius * 1000 // Convert km to meters
        }
      }
    })
    .populate('driverId', 'name phone isOnDuty')
    .limit(10);

    // Filter ambulances with on-duty drivers
    const availableAmbulances = ambulances.filter(
      ambulance => ambulance.driverId && ambulance.driverId.isOnDuty
    );

    // Calculate distances and ETAs
    const ambulancesWithDistance = availableAmbulances.map(ambulance => {
      const distance = calculateDistance(
        latitude,
        longitude,
        ambulance.currentLocation.latitude,
        ambulance.currentLocation.longitude
      );

      const eta = Math.ceil(distance / 40 * 60); // Assume 40 km/h average speed

      return {
        id: ambulance._id,
        vehicleNumber: ambulance.vehicleNumber,
        type: ambulance.type,
        location: ambulance.currentLocation,
        driver: {
          name: ambulance.driverId.name,
          phone: ambulance.driverId.phone
        },
        distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
        estimatedArrival: eta
      };
    });

    // Sort by distance
    ambulancesWithDistance.sort((a, b) => a.distance - b.distance);

    res.json({ 
      ambulances: ambulancesWithDistance,
      count: ambulancesWithDistance.length
    });
  } catch (error) {
    console.error('Get nearby ambulances error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all ambulance locations (admin/hospital view)
router.get('/ambulances', authenticateToken, authorizeRoles('admin', 'hospital'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const ambulances = await Ambulance.find(filter)
      .populate('driverId', 'name phone isOnDuty')
      .select('vehicleNumber type currentLocation status driverId');

    const ambulanceLocations = ambulances.map(ambulance => ({
      id: ambulance._id,
      vehicleNumber: ambulance.vehicleNumber,
      type: ambulance.type,
      status: ambulance.status,
      location: ambulance.currentLocation,
      driver: ambulance.driverId ? {
        id: ambulance.driverId._id,
        name: ambulance.driverId.name,
        phone: ambulance.driverId.phone,
        isOnDuty: ambulance.driverId.isOnDuty
      } : null
    }));

    res.json({ ambulances: ambulanceLocations });
  } catch (error) {
    console.error('Get ambulance locations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific ambulance location and route (for tracking)
router.get('/ambulance/:ambulanceId/track', async (req, res) => {
  try {
    const ambulance = await Ambulance.findById(req.params.ambulanceId)
      .populate('driverId', 'name phone');

    if (!ambulance) {
      return res.status(404).json({ error: 'Ambulance not found' });
    }

    // Find active booking for this ambulance
    const activeBooking = await Booking.findOne({
      ambulanceId: ambulance._id,
      status: { $in: ['assigned', 'en-route', 'arrived', 'transporting'] }
    });

    const trackingData = {
      ambulance: {
        id: ambulance._id,
        vehicleNumber: ambulance.vehicleNumber,
        type: ambulance.type,
        status: ambulance.status,
        location: ambulance.currentLocation,
        driver: ambulance.driverId ? {
          name: ambulance.driverId.name,
          phone: ambulance.driverId.phone
        } : null
      },
      booking: activeBooking ? {
        bookingId: activeBooking.bookingId,
        status: activeBooking.status,
        pickupLocation: activeBooking.location.pickup,
        destinationLocation: activeBooking.location.destination,
        estimatedArrival: activeBooking.estimatedArrival,
        patientName: activeBooking.patientInfo.name
      } : null
    };

    res.json(trackingData);
  } catch (error) {
    console.error('Track ambulance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get hospitals near location
router.post('/nearby-hospitals', async (req, res) => {
  try {
    const { latitude, longitude, radius = 20, specialty } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    let filter = {
      role: 'hospital',
      isActive: true
    };

    // Add specialty filter if provided
    if (specialty) {
      filter.specialties = { $in: [specialty] };
    }

    const hospitals = await User.find(filter)
      .select('hospitalName hospitalAddress hospitalLocation phone capacity specialties');

    // Calculate distances and filter by radius
    const hospitalsWithDistance = hospitals
      .map(hospital => {
        const distance = calculateDistance(
          latitude,
          longitude,
          hospital.hospitalLocation.latitude,
          hospital.hospitalLocation.longitude
        );

        return {
          id: hospital._id,
          name: hospital.hospitalName,
          address: hospital.hospitalAddress,
          location: hospital.hospitalLocation,
          phone: hospital.phone,
          capacity: hospital.capacity,
          specialties: hospital.specialties,
          distance: Math.round(distance * 100) / 100
        };
      })
      .filter(hospital => hospital.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    res.json({ 
      hospitals: hospitalsWithDistance,
      count: hospitalsWithDistance.length
    });
  } catch (error) {
    console.error('Get nearby hospitals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all hospitals (public endpoint for patient map)
router.get('/all-hospitals', async (req, res) => {
  try {
    const hospitals = await User.find({
      role: 'hospital',
      isActive: true,
      isApproved: true
    }).select('hospitalName hospitalAddress hospitalLocation phone capacity specialties');

    const hospitalData = hospitals.map(hospital => ({
      id: hospital._id,
      name: hospital.hospitalName,
      address: hospital.hospitalAddress,
      location: hospital.hospitalLocation,
      phone: hospital.phone,
      capacity: hospital.capacity,
      specialties: hospital.specialties
    }));

    res.json({ 
      hospitals: hospitalData,
      count: hospitalData.length
    });
  } catch (error) {
    console.error('Get all hospitals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all available ambulances (public endpoint for patient map)
router.get('/all-ambulances', async (req, res) => {
  try {
    const ambulances = await Ambulance.find({
      status: { $in: ['available', 'busy'] },
      driverId: { $exists: true, $ne: null }
    })
    .populate('driverId', 'name phone isOnDuty isActive isApproved')
    .select('vehicleNumber type currentLocation status driverId');

    // Include all ambulances with assigned drivers (approved and active)
    const availableAmbulances = ambulances
      .filter(amb => amb.driverId && amb.driverId.isApproved && amb.driverId.isActive)
      .map(ambulance => ({
        id: ambulance._id,
        vehicleNumber: ambulance.vehicleNumber,
        type: ambulance.type,
        status: ambulance.status,
        location: ambulance.currentLocation,
        driver: {
          id: ambulance.driverId._id,
          name: ambulance.driverId.name,
          phone: ambulance.driverId.phone,
          isOnDuty: ambulance.driverId.isOnDuty
        }
      }));

    res.json({ 
      ambulances: availableAmbulances,
      count: availableAmbulances.length
    });
  } catch (error) {
    console.error('Get all ambulances error:', error);
    res.status(500).json({ error: 'Failed to fetch ambulances' });
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

function calculateUpdatedETA(currentLocation, destination) {
  try {
    const distance = calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      destination.latitude,
      destination.longitude
    );
    
    // Assume average speed of 40 km/h in city traffic
    return Math.ceil(distance / 40 * 60);
  } catch (error) {
    console.error('Calculate ETA error:', error);
    return null;
  }
}

module.exports = router;