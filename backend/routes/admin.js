const express = require('express');
const User = require('../models/User');
const Ambulance = require('../models/Ambulance');
const Booking = require('../models/Booking');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Get system overview/dashboard
router.get('/dashboard', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Get current statistics
    const totalAmbulances = await Ambulance.countDocuments();
    const availableAmbulances = await Ambulance.countDocuments({ status: 'available' });
    const busyAmbulances = await Ambulance.countDocuments({ status: 'busy' });
    const offlineAmbulances = await Ambulance.countDocuments({ status: 'offline' });

    const totalDrivers = await User.countDocuments({ role: 'driver' });
    const onDutyDrivers = await User.countDocuments({ role: 'driver', isOnDuty: true });

    const totalHospitals = await User.countDocuments({ role: 'hospital' });
    const activeHospitals = await User.countDocuments({ role: 'hospital', isActive: true });

    // Get booking statistics for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayBookings = await Booking.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });

    const activeBookings = await Booking.countDocuments({
      status: { $in: ['pending', 'assigned', 'en-route', 'arrived', 'transporting'] }
    });

    const completedToday = await Booking.countDocuments({
      status: 'completed',
      completedAt: { $gte: today, $lt: tomorrow }
    });

    // Get severity breakdown for active bookings
    const severityBreakdown = await Booking.aggregate([
      {
        $match: {
          status: { $in: ['pending', 'assigned', 'en-route', 'arrived', 'transporting'] }
        }
      },
      {
        $group: {
          _id: '$emergencyDetails.severity',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: -1 }
      }
    ]);

    // Get recent bookings
    const recentBookings = await Booking.find()
      .populate('ambulanceId', 'vehicleNumber')
      .populate('driverId', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('bookingId patientInfo.name emergencyDetails.severity status createdAt ambulanceId driverId');

    res.json({
      overview: {
        ambulances: {
          total: totalAmbulances,
          available: availableAmbulances,
          busy: busyAmbulances,
          offline: offlineAmbulances
        },
        drivers: {
          total: totalDrivers,
          onDuty: onDutyDrivers,
          offDuty: totalDrivers - onDutyDrivers
        },
        hospitals: {
          total: totalHospitals,
          active: activeHospitals
        },
        bookings: {
          today: todayBookings,
          active: activeBookings,
          completedToday: completedToday,
          severityBreakdown: severityBreakdown.reduce((acc, item) => {
            acc[`severity${item._id}`] = item.count;
            return acc;
          }, {})
        }
      },
      recentBookings
    });
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all ambulances with details
router.get('/ambulances', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};

    const ambulances = await Ambulance.find(filter)
      .populate('driverId', 'name phone email isOnDuty')
      .sort({ vehicleNumber: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Ambulance.countDocuments(filter);

    res.json({
      ambulances,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get ambulances error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new ambulance
router.post('/ambulances', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const {
      vehicleNumber,
      type,
      equipment,
      currentLocation,
      baseStation,
      serviceArea
    } = req.body;

    // Check if vehicle number already exists
    const existingAmbulance = await Ambulance.findOne({ vehicleNumber });
    if (existingAmbulance) {
      return res.status(400).json({ error: 'Vehicle number already exists' });
    }

    const ambulance = new Ambulance({
      vehicleNumber: vehicleNumber.toUpperCase(),
      type,
      equipment: equipment || [],
      currentLocation: currentLocation || {
        latitude: 12.9716, // Default to Chennai coordinates
        longitude: 80.2446
      },
      baseStation,
      serviceArea: serviceArea || []
    });

    await ambulance.save();

    res.status(201).json({
      message: 'Ambulance created successfully',
      ambulance
    });
  } catch (error) {
    console.error('Create ambulance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ambulance
router.patch('/ambulances/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const ambulance = await Ambulance.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('driverId', 'name phone email');

    if (!ambulance) {
      return res.status(404).json({ error: 'Ambulance not found' });
    }

    res.json({
      message: 'Ambulance updated successfully',
      ambulance
    });
  } catch (error) {
    console.error('Update ambulance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all drivers
router.get('/drivers', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let filter = { role: 'driver' };
    
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (status === 'on-duty') filter.isOnDuty = true;
    if (status === 'off-duty') filter.isOnDuty = false;

    const drivers = await User.find(filter)
      .populate('ambulanceId', 'vehicleNumber type status')
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    res.json({
      drivers,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get drivers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update driver status
router.patch('/drivers/:id/status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { isActive, isOnDuty } = req.body;
    
    const updateData = {};
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (typeof isOnDuty === 'boolean') updateData.isOnDuty = isOnDuty;

    const driver = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('ambulanceId');

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Update ambulance status if driver duty status changed
    if (typeof isOnDuty === 'boolean' && driver.ambulanceId) {
      const ambulanceStatus = isOnDuty ? 'available' : 'offline';
      await Ambulance.findByIdAndUpdate(driver.ambulanceId._id, { status: ambulanceStatus });
    }

    res.json({
      message: 'Driver status updated successfully',
      driver
    });
  } catch (error) {
    console.error('Update driver status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all hospitals
router.get('/hospitals', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const hospitals = await User.find({ role: 'hospital' })
      .sort({ hospitalName: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments({ role: 'hospital' });

    res.json({
      hospitals,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get hospitals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get system analytics
router.get('/analytics', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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

    // Booking trends
    const bookingTrends = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === '24h' ? '%Y-%m-%d %H:00' : '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Response time analytics
    const responseTimeAnalytics = await Booking.aggregate([
      {
        $match: {
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
          },
          severity: '$emergencyDetails.severity'
        }
      },
      {
        $group: {
          _id: '$severity',
          avgResponseTime: { $avg: '$responseTime' },
          minResponseTime: { $min: '$responseTime' },
          maxResponseTime: { $max: '$responseTime' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Peak hours analysis
    const peakHours = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Geographic distribution (simplified)
    const geographicDistribution = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            lat: { $round: ['$location.pickup.latitude', 2] },
            lng: { $round: ['$location.pickup.longitude', 2] }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 20
      }
    ]);

    res.json({
      period,
      analytics: {
        bookingTrends,
        responseTimeAnalytics,
        peakHours,
        geographicDistribution
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manually assign ambulance to booking
router.patch('/bookings/:bookingId/assign', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { ambulanceId } = req.body;

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({ error: 'Booking is not available for assignment' });
    }

    const ambulance = await Ambulance.findById(ambulanceId).populate('driverId');
    if (!ambulance) {
      return res.status(404).json({ error: 'Ambulance not found' });
    }

    if (ambulance.status !== 'available') {
      return res.status(400).json({ error: 'Ambulance is not available' });
    }

    // Update booking
    booking.status = 'assigned';
    booking.ambulanceId = ambulanceId;
    booking.driverId = ambulance.driverId._id;
    
    // Add timeline entry
    booking.timeline.push({
      status: 'assigned',
      timestamp: new Date(),
      notes: 'Manually assigned by admin'
    });

    await booking.save();

    // Update ambulance status
    await Ambulance.findByIdAndUpdate(ambulanceId, { status: 'busy' });

    // Emit real-time update
    const io = req.app.get('io');
    io.emit('booking-update', {
      bookingId: booking.bookingId,
      status: booking.status,
      ambulanceId: booking.ambulanceId,
      driverId: booking.driverId
    });

    res.json({
      message: 'Ambulance assigned successfully',
      booking: {
        bookingId: booking.bookingId,
        status: booking.status,
        ambulance: {
          vehicleNumber: ambulance.vehicleNumber,
          driver: ambulance.driverId.name
        }
      }
    });
  } catch (error) {
    console.error('Assign ambulance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pending registrations
router.get('/pending-registrations', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Get pending drivers
    const drivers = await User.find({
      role: 'driver',
      isApproved: false,
      isActive: false
    }).select('-password').sort({ createdAt: -1 });

    // Get pending hospitals
    const hospitals = await User.find({
      role: 'hospital',
      isApproved: false,
      isActive: false
    }).select('-password').sort({ createdAt: -1 });

    res.json({
      drivers,
      hospitals,
      total: drivers.length + hospitals.length
    });
  } catch (error) {
    console.error('Get pending registrations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve driver with automatic ambulance assignment
router.patch('/approve-driver/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const driver = await User.findById(req.params.id);
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    if (driver.role !== 'driver') {
      return res.status(400).json({ error: 'User is not a driver' });
    }

    // Find an available ambulance without a driver
    const availableAmbulance = await Ambulance.findOne({
      driverId: { $exists: false }
    }).sort({ createdAt: 1 }); // Get oldest unassigned ambulance

    if (!availableAmbulance) {
      return res.status(400).json({ 
        error: 'No available ambulances. Please add more ambulances or wait for one to become available.' 
      });
    }

    // Approve driver and assign ambulance
    driver.isApproved = true;
    driver.isActive = true;
    driver.ambulanceId = availableAmbulance._id;
    await driver.save();

    // Assign driver to ambulance
    availableAmbulance.driverId = driver._id;
    availableAmbulance.status = 'offline'; // Driver needs to go on duty
    await availableAmbulance.save();

    console.log(`✓ Driver approved: ${driver.email}`);
    console.log(`✓ Ambulance assigned: ${availableAmbulance.vehicleNumber}`);

    res.json({
      message: 'Driver approved and ambulance assigned successfully',
      driver: {
        id: driver._id,
        name: driver.name,
        email: driver.email
      },
      ambulance: {
        id: availableAmbulance._id,
        vehicleNumber: availableAmbulance.vehicleNumber,
        type: availableAmbulance.type
      }
    });
  } catch (error) {
    console.error('Approve driver error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve hospital
router.patch('/approve-hospital/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const hospital = await User.findById(req.params.id);
    
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    if (hospital.role !== 'hospital') {
      return res.status(400).json({ error: 'User is not a hospital' });
    }

    // Approve hospital
    hospital.isApproved = true;
    hospital.isActive = true;
    await hospital.save();

    console.log(`✓ Hospital approved: ${hospital.hospitalName}`);

    res.json({
      message: 'Hospital approved successfully',
      hospital: {
        id: hospital._id,
        name: hospital.hospitalName,
        email: hospital.email
      }
    });
  } catch (error) {
    console.error('Approve hospital error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject registration
router.patch('/reject-registration/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete the user (rejected)
    await User.findByIdAndDelete(req.params.id);

    console.log(`✓ Registration rejected: ${user.email} - Reason: ${reason}`);

    res.json({
      message: 'Registration rejected successfully'
    });
  } catch (error) {
    console.error('Reject registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get approved users (drivers and hospitals)
router.get('/approved-users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Get approved drivers with their ambulance info
    const drivers = await User.find({
      role: 'driver',
      isApproved: true,
      isActive: true
    })
    .populate('ambulanceId', 'vehicleNumber type status')
    .select('-password')
    .sort({ createdAt: -1 });

    // Get approved hospitals
    const hospitals = await User.find({
      role: 'hospital',
      isApproved: true,
      isActive: true
    })
    .select('-password')
    .sort({ createdAt: -1 });

    res.json({
      drivers,
      hospitals,
      total: drivers.length + hospitals.length
    });
  } catch (error) {
    console.error('Get approved users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deactivate user
router.patch('/deactivate-user/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Deactivate user
    user.isActive = false;
    await user.save();

    console.log(`✓ User deactivated: ${user.email}`);

    res.json({
      message: 'User deactivated successfully',
      user: {
        id: user._id,
        name: user.name || user.hospitalName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all customer reviews
router.get('/reviews', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const reviews = await Booking.find({ 'feedback.rating': { $exists: true } })
      .populate('location.destination.hospitalId', 'hospitalName')
      .populate('driverId', 'name phone')
      .select('bookingId patientInfo location feedback completedAt driverId')
      .sort({ 'feedback.submittedAt': -1 });
    res.json({ reviews, total: reviews.length });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;