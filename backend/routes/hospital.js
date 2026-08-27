const express = require('express');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Get incoming ambulances for hospital
router.get('/incoming', authenticateToken, authorizeRoles('hospital'), async (req, res) => {
  try {
    const hospital = await User.findById(req.user.userId);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    // Find bookings where this hospital is the destination or nearby
    const incomingBookings = await Booking.find({
      $or: [
        { 'location.destination.hospitalId': req.user.userId },
        {
          status: { $in: ['assigned', 'en-route', 'transporting'] },
          'location.destination.hospitalId': { $exists: false }
        }
      ],
      status: { $in: ['assigned', 'en-route', 'arrived', 'transporting'] }
    })
    .populate('ambulanceId', 'vehicleNumber type')
    .populate('driverId', 'name phone currentLocation')
    .sort({ 'emergencyDetails.severity': -1, createdAt: 1 });

    // Calculate distance and ETA for bookings without assigned hospital
    const bookingsWithDetails = await Promise.all(
      incomingBookings.map(async (booking) => {
        let distance = null;
        let eta = null;

        // If no hospital assigned, calculate distance from hospital
        if (!booking.location.destination.hospitalId) {
          if (booking.driverId && booking.driverId.currentLocation) {
            distance = calculateDistance(
              booking.driverId.currentLocation.latitude,
              booking.driverId.currentLocation.longitude,
              hospital.hospitalLocation.latitude,
              hospital.hospitalLocation.longitude
            );
            eta = Math.ceil(distance / 40 * 60); // Assume 40 km/h average speed
          }
        }

        return {
          bookingId: booking.bookingId,
          patientInfo: booking.patientInfo,
          emergencyDetails: booking.emergencyDetails,
          driverReport: booking.driverReport, // Include injury details
          status: booking.status,
          pickupLocation: booking.location.pickup,
          destinationHospital: booking.location.destination.hospitalId ? 'Assigned' : 'Not Assigned',
          ambulance: booking.ambulanceId ? {
            vehicleNumber: booking.ambulanceId.vehicleNumber,
            type: booking.ambulanceId.type
          } : null,
          driver: booking.driverId ? {
            name: booking.driverId.name,
            phone: booking.driverId.phone,
            currentLocation: booking.driverId.currentLocation
          } : null,
          estimatedArrival: booking.estimatedArrival,
          distance: distance ? Math.round(distance * 100) / 100 : null,
          eta: eta,
          timeline: booking.timeline,
          createdAt: booking.createdAt
        };
      })
    );

    // Sort by severity and then by ETA
    bookingsWithDetails.sort((a, b) => {
      if (a.emergencyDetails.severity !== b.emergencyDetails.severity) {
        return b.emergencyDetails.severity - a.emergencyDetails.severity;
      }
      if (a.eta && b.eta) {
        return a.eta - b.eta;
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    res.json({ 
      bookings: bookingsWithDetails,
      hospitalInfo: {
        name: hospital.hospitalName,
        capacity: hospital.capacity,
        specialties: hospital.specialties
      }
    });
  } catch (error) {
    console.error('Get incoming ambulances error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept incoming ambulance (assign hospital as destination)
router.patch('/accept/:bookingId', authenticateToken, authorizeRoles('hospital'), async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (!['assigned', 'en-route'].includes(booking.status)) {
      return res.status(400).json({ error: 'Booking cannot be accepted at this stage' });
    }

    const hospital = await User.findById(req.user.userId);
    
    // Update booking destination
    booking.location.destination = {
      hospitalId: req.user.userId,
      latitude: hospital.hospitalLocation.latitude,
      longitude: hospital.hospitalLocation.longitude,
      address: hospital.hospitalAddress
    };

    // Add timeline entry
    booking.timeline.push({
      status: 'hospital-assigned',
      timestamp: new Date(),
      notes: `Accepted by ${hospital.hospitalName}`
    });

    await booking.save();

    // Emit real-time update
    const io = req.app.get('io');
    io.emit('booking-update', {
      bookingId: booking.bookingId,
      destination: booking.location.destination,
      hospitalName: hospital.hospitalName
    });

    // Notify driver about hospital assignment
    if (booking.driverId) {
      io.to(`driver-${booking.driverId}`).emit('hospital-assigned', {
        bookingId: booking.bookingId,
        hospital: {
          name: hospital.hospitalName,
          address: hospital.hospitalAddress,
          location: hospital.hospitalLocation,
          phone: hospital.phone
        }
      });
    }

    res.json({ 
      message: 'Ambulance accepted successfully',
      hospital: {
        name: hospital.hospitalName,
        address: hospital.hospitalAddress
      }
    });
  } catch (error) {
    console.error('Accept ambulance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get hospital statistics
router.get('/stats', authenticateToken, authorizeRoles('hospital'), async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get statistics
    const totalReceived = await Booking.countDocuments({
      'location.destination.hospitalId': req.user.userId,
      createdAt: { $gte: startDate }
    });

    const completedCases = await Booking.countDocuments({
      'location.destination.hospitalId': req.user.userId,
      status: 'completed',
      createdAt: { $gte: startDate }
    });

    const currentlyIncoming = await Booking.countDocuments({
      'location.destination.hospitalId': req.user.userId,
      status: { $in: ['assigned', 'en-route', 'arrived', 'transporting'] }
    });

    // Get severity breakdown
    const severityStats = await Booking.aggregate([
      {
        $match: {
          'location.destination.hospitalId': req.user.userId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$emergencyDetails.severity',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get average response time
    const responseTimeStats = await Booking.aggregate([
      {
        $match: {
          'location.destination.hospitalId': req.user.userId,
          status: 'completed',
          createdAt: { $gte: startDate },
          actualArrival: { $exists: true }
        }
      },
      {
        $project: {
          responseTime: {
            $divide: [
              { $subtract: ['$actualArrival', '$createdAt'] },
              60000 // Convert to minutes
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgResponseTime: { $avg: '$responseTime' },
          minResponseTime: { $min: '$responseTime' },
          maxResponseTime: { $max: '$responseTime' }
        }
      }
    ]);

    res.json({
      period,
      statistics: {
        totalReceived,
        completedCases,
        currentlyIncoming,
        completionRate: totalReceived > 0 ? Math.round((completedCases / totalReceived) * 100) : 0,
        severityBreakdown: severityStats.reduce((acc, item) => {
          acc[`severity${item._id}`] = item.count;
          return acc;
        }, {}),
        responseTime: responseTimeStats[0] || {
          avgResponseTime: 0,
          minResponseTime: 0,
          maxResponseTime: 0
        }
      }
    });
  } catch (error) {
    console.error('Get hospital stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get preparation guidelines based on severity
router.get('/preparation/:severity', authenticateToken, authorizeRoles('hospital'), async (req, res) => {
  try {
    const severity = parseInt(req.params.severity);
    
    if (severity < 1 || severity > 5) {
      return res.status(400).json({ error: 'Invalid severity level' });
    }

    const guidelines = getPreparationGuidelines(severity);
    
    res.json({ 
      severity,
      guidelines
    });
  } catch (error) {
    console.error('Get preparation guidelines error:', error);
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

function getPreparationGuidelines(severity) {
  const guidelines = {
    1: {
      level: 'Low Priority',
      color: 'green',
      preparations: [
        'Standard triage assessment',
        'Basic monitoring equipment ready',
        'General examination room preparation'
      ],
      estimatedTime: '15-30 minutes',
      resources: 'Standard nursing staff'
    },
    2: {
      level: 'Moderate Priority',
      color: 'yellow',
      preparations: [
        'Prepare monitoring equipment',
        'Have IV access materials ready',
        'Alert attending physician',
        'Prepare basic diagnostic tools'
      ],
      estimatedTime: '10-20 minutes',
      resources: 'Nurse + Physician'
    },
    3: {
      level: 'High Priority',
      color: 'orange',
      preparations: [
        'Prepare trauma bay',
        'Set up advanced monitoring',
        'Have blood pressure and oxygen ready',
        'Alert specialist if needed',
        'Prepare for potential procedures'
      ],
      estimatedTime: '5-15 minutes',
      resources: 'Medical team + Specialist on standby'
    },
    4: {
      level: 'Critical Priority',
      color: 'red',
      preparations: [
        'Activate trauma team',
        'Prepare resuscitation equipment',
        'Set up advanced life support',
        'Have blood bank on standby',
        'Prepare operating room if needed',
        'Alert anesthesiologist'
      ],
      estimatedTime: '2-10 minutes',
      resources: 'Full trauma team + OR team'
    },
    5: {
      level: 'Life-Threatening Emergency',
      color: 'darkred',
      preparations: [
        'Immediate trauma team activation',
        'Prepare for immediate resuscitation',
        'Have all emergency medications ready',
        'Activate blood bank protocol',
        'Prepare operating room immediately',
        'Alert all specialists',
        'Have crash cart ready'
      ],
      estimatedTime: 'Immediate response required',
      resources: 'All available medical staff'
    }
  };

  return guidelines[severity] || guidelines[3];
}

// Get patient history for hospital
router.get('/history', authenticateToken, authorizeRoles('hospital'), async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const bookings = await Booking.find({
      'location.destination.hospitalId': req.user.userId,
      status: { $in: ['completed', 'cancelled'] }
    })
    .populate('ambulanceId', 'vehicleNumber type')
    .populate('driverId', 'name phone')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error('Get patient history error:', error);
    res.status(500).json({ error: 'Failed to get patient history' });
  }
});

module.exports = router;