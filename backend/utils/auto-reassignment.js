// Auto-reassignment service for bookings
const Booking = require('../models/Booking');
const Ambulance = require('../models/Ambulance');
const User = require('../models/User');

// Store active reassignment timers
const reassignmentTimers = new Map();

// Configuration
const REASSIGNMENT_TIMEOUT = 120000; // 2 minutes — give driver enough time to accept
const MAX_REASSIGNMENT_ATTEMPTS = 3;

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Find an available on-duty driver not already assigned to a busy ambulance.
 */
async function findAvailableDriver(excludeDriverIds = []) {
  const candidateDrivers = await User.find({
    role: 'driver',
    isActive: true,
    isApproved: true,
    isOnDuty: true,
    _id: { $nin: excludeDriverIds }
  }).populate('ambulanceId', 'status');

  for (const driver of candidateDrivers) {
    if (driver.ambulanceId) {
      if (driver.ambulanceId.status === 'available') {
        return driver;
      }
      continue;
    }
    return driver;
  }

  return null;
}

/**
 * Attach a free driver to an ambulance if missing or not on duty.
 */
async function ensureAmbulanceHasDriver(ambulance) {
  if (ambulance.driverId && ambulance.driverId.isOnDuty) {
    return ambulance;
  }

  const excludingIds = ambulance.driverId ? [ambulance.driverId._id] : [];
  const driver = await findAvailableDriver(excludingIds);

  if (!driver) {
    console.log('⚠ No available driver found to assign to ambulance', ambulance.vehicleNumber);
    return null;
  }

  ambulance.driverId = driver._id;
  ambulance.status = 'available';
  await ambulance.save();

  driver.ambulanceId = ambulance._id;
  await driver.save();

  console.log(`✓ Linked driver ${driver.name} (${driver.phone}) to ambulance ${ambulance.vehicleNumber}`);

  return await Ambulance.findById(ambulance._id).populate('driverId');
}

/**
 * Find nearest available ambulance with optimized local area preference
 */
async function findNearestAmbulance(pickupLocation, excludeAmbulanceIds = []) {
  try {
    const availableAmbulances = await Ambulance.find({
      status: 'available',
      _id: { $nin: excludeAmbulanceIds }
    }).populate('driverId');

    if (availableAmbulances.length === 0) {
      return null;
    }

    let closestOnDuty = null;
    let minDistanceOnDuty = Infinity;
    let closestFallback = null;
    let minDistanceFallback = Infinity;

    for (const ambulance of availableAmbulances) {
      if (!ambulance.currentLocation) continue;

      const distance = calculateDistance(
        pickupLocation.latitude,
        pickupLocation.longitude,
        ambulance.currentLocation.latitude,
        ambulance.currentLocation.longitude
      );

      if (ambulance.driverId && ambulance.driverId.isOnDuty) {
        if (distance < minDistanceOnDuty) {
          minDistanceOnDuty = distance;
          closestOnDuty = ambulance;
        }
      } else {
        // Keep fallback ambulances (driverless or offline driver)
        if (distance < minDistanceFallback) {
          minDistanceFallback = distance;
          closestFallback = ambulance;
        }
      }
    }

    // Prefer on-duty driver, but always fall back to any available ambulance
    if (closestOnDuty) {
      console.log(`✓ Found on-duty ambulance at ${minDistanceOnDuty.toFixed(2)} km`);
      return { ambulance: closestOnDuty, distance: minDistanceOnDuty };
    }

    if (closestFallback) {
      console.log(`⚠ No on-duty ambulance found, using fallback ambulance at ${minDistanceFallback.toFixed(2)} km`);
      return { ambulance: closestFallback, distance: minDistanceFallback };
    }

    return null;
  } catch (error) {
    console.error('Find nearest ambulance error:', error);
    return null;
  }
}

/**
 * Assign booking to ambulance/driver
 */
async function assignBooking(booking, ambulance, io) {
  try {
    // Attach driver if missing
    if (!ambulance.driverId) {
      ambulance = await ensureAmbulanceHasDriver(ambulance);
      if (!ambulance || !ambulance.driverId) {
        console.warn(`⚠ Cannot assign booking ${booking.bookingId}: no driver available`);
        return false;
      }
    }

    // Update booking
    booking.status = 'assigned';
    booking.ambulanceId = ambulance._id;
    booking.driverId = ambulance.driverId._id;
    
    // Initialize reassignment tracking if not exists
    if (!booking.reassignmentAttempts) {
      booking.reassignmentAttempts = [];
    }
    
    // Add reassignment attempt
    booking.reassignmentAttempts.push({
      ambulanceId: ambulance._id,
      driverId: ambulance.driverId._id,
      assignedAt: new Date(),
      status: 'pending'
    });

    // Add timeline entry
    booking.timeline.push({
      status: 'assigned',
      timestamp: new Date(),
      notes: `Assigned to ${ambulance.driverId.name} (${ambulance.vehicleNumber})`
    });

    await booking.save();

    // Update ambulance status
    await Ambulance.findByIdAndUpdate(ambulance._id, { status: 'busy' });

    // Emit real-time notification to driver
    if (io) {
      io.to(`driver-${ambulance.driverId._id}`).emit('new-booking-assigned', {
        bookingId: booking.bookingId,
        patientInfo: booking.patientInfo,
        emergencyDetails: booking.emergencyDetails,
        location: booking.location.pickup,
        message: 'New emergency request assigned to you'
      });

      // Publish to patient/booking listeners so UI updates faster
      io.emit('booking-update', {
        bookingId: booking.bookingId,
        status: 'assigned'
      });
    }

    console.log(`✓ Booking ${booking.bookingId} assigned to driver ${ambulance.driverId.name}`);
    return true;
  } catch (error) {
    console.error('Assign booking error:', error);
    return false;
  }
}

/**
 * Start auto-reassignment timer for a booking
 */
function startReassignmentTimer(bookingId, io) {
  // Clear existing timer if any
  if (reassignmentTimers.has(bookingId)) {
    clearTimeout(reassignmentTimers.get(bookingId));
  }

  const timer = setTimeout(async () => {
    try {
      await checkAndReassign(bookingId, io);
    } catch (error) {
      console.error(`Reassignment check error for ${bookingId}:`, error);
    } finally {
      reassignmentTimers.delete(bookingId);
    }
  }, REASSIGNMENT_TIMEOUT);

  reassignmentTimers.set(bookingId, timer);
  console.log(`⏱ Reassignment timer started for booking ${bookingId} (60 seconds)`);
}

/**
 * Check if booking needs reassignment and reassign if necessary
 */
async function checkAndReassign(bookingId, io) {
  try {
    const booking = await Booking.findOne({ bookingId })
      .populate('ambulanceId')
      .populate('driverId');

    if (!booking) {
      console.log(`Booking ${bookingId} not found for reassignment check`);
      return;
    }

    // Check if driver has accepted or booking is in progress
    if (booking.status === 'accepted' || 
        booking.status === 'en-route' || 
        booking.status === 'arrived' ||
        booking.status === 'picked-up' ||
        booking.status === 'transporting' ||
        booking.status === 'completed' ||
        booking.status === 'cancelled') {
      console.log(`✓ Booking ${bookingId} already in-progress (${booking.status}), no reassignment needed`);
      return;
    }

    // Also stop if driver already accepted at any point (driverAcceptance flag)
    if (booking.driverAcceptance && booking.driverAcceptance.accepted) {
      console.log(`✓ Booking ${bookingId} driver already accepted, no reassignment needed`);
      return;
    }

    // Check if still in assigned status
    if (booking.status !== 'assigned') {
      console.log(`Booking ${bookingId} status is ${booking.status}, skipping reassignment`);
      return;
    }

    // Check reassignment attempts
    const attemptCount = booking.reassignmentAttempts?.length || 0;
    if (attemptCount >= MAX_REASSIGNMENT_ATTEMPTS) {
      console.log(`⚠ Booking ${bookingId} reached max reassignment attempts (${MAX_REASSIGNMENT_ATTEMPTS})`);
      
      // Update booking status to indicate no ambulance available
      booking.status = 'pending';
      booking.timeline.push({
        status: 'reassignment-failed',
        timestamp: new Date(),
        notes: `Max reassignment attempts reached (${MAX_REASSIGNMENT_ATTEMPTS}). No available ambulances.`
      });
      await booking.save();

      // Notify admin/system
      if (io) {
        io.emit('reassignment-failed', {
          bookingId: booking.bookingId,
          message: 'Unable to find available ambulance after multiple attempts'
        });
      }

      return;
    }

    console.log(`⚠ Driver did not respond to booking ${bookingId}, attempting reassignment...`);

    // Mark current attempt as failed
    if (booking.reassignmentAttempts && booking.reassignmentAttempts.length > 0) {
      const lastAttempt = booking.reassignmentAttempts[booking.reassignmentAttempts.length - 1];
      lastAttempt.status = 'no-response';
      lastAttempt.failedAt = new Date();
    }

    // Make current ambulance available again
    if (booking.ambulanceId) {
      await Ambulance.findByIdAndUpdate(booking.ambulanceId._id, { status: 'available' });
    }

    // Get list of previously tried ambulances
    const excludeAmbulanceIds = booking.reassignmentAttempts?.map(a => a.ambulanceId) || [];

    // Find next nearest ambulance
    const result = await findNearestAmbulance(booking.location.pickup, excludeAmbulanceIds);

    if (!result) {
      console.log(`⚠ No available ambulances found for booking ${bookingId}`);
      
      // Update booking status
      booking.status = 'pending';
      booking.timeline.push({
        status: 'reassignment-pending',
        timestamp: new Date(),
        notes: `Reassignment attempt ${attemptCount + 1}: No available ambulances found`
      });
      await booking.save();

      // Notify admin/system
      if (io) {
        io.emit('no-ambulance-available', {
          bookingId: booking.bookingId,
          message: 'No available ambulances for reassignment'
        });
      }

      return;
    }

    // Assign to new ambulance
    console.log(`🔄 Reassigning booking ${bookingId} to ${result.ambulance.driverId.name} (${result.distance.toFixed(2)} km away)`);
    
    const assigned = await assignBooking(booking, result.ambulance, io);

    if (assigned) {
      // Start new reassignment timer
      startReassignmentTimer(bookingId, io);

      // Notify about reassignment
      if (io) {
        io.emit('booking-reassigned', {
          bookingId: booking.bookingId,
          newDriverId: result.ambulance.driverId._id,
          newAmbulanceId: result.ambulance._id,
          attemptNumber: attemptCount + 1
        });
      }
    }

  } catch (error) {
    console.error(`Check and reassign error for ${bookingId}:`, error);
  }
}

/**
 * Cancel reassignment timer (when driver accepts)
 */
function cancelReassignmentTimer(bookingId) {
  if (reassignmentTimers.has(bookingId)) {
    clearTimeout(reassignmentTimers.get(bookingId));
    reassignmentTimers.delete(bookingId);
    console.log(`✓ Reassignment timer cancelled for booking ${bookingId}`);
  }
}

/**
 * Find nearest hospital to pickup location
 */
async function findNearestHospital(pickupLocation, preferredHospitalId = null) {
  try {
    // If preferred hospital is specified, use it
    if (preferredHospitalId) {
      const hospital = await User.findOne({
        _id: preferredHospitalId,
        role: 'hospital',
        isApproved: true,
        isActive: true
      });
      
      if (hospital && hospital.hospitalLocation) {
        const distance = calculateDistance(
          pickupLocation.latitude,
          pickupLocation.longitude,
          hospital.hospitalLocation.latitude,
          hospital.hospitalLocation.longitude
        );
        console.log(`✓ Using preferred hospital: ${hospital.hospitalName} (${distance.toFixed(2)} km away)`);
        return { hospital, distance };
      }
    }

    // Find all active hospitals
    const hospitals = await User.find({
      role: 'hospital',
      isApproved: true,
      isActive: true
    });

    if (hospitals.length === 0) {
      console.log('⚠ No active hospitals found');
      return null;
    }

    let closestHospital = null;
    let minDistance = Infinity;

    for (const hospital of hospitals) {
      if (!hospital.hospitalLocation) continue;

      const distance = calculateDistance(
        pickupLocation.latitude,
        pickupLocation.longitude,
        hospital.hospitalLocation.latitude,
        hospital.hospitalLocation.longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestHospital = hospital;
      }
    }

    if (closestHospital) {
      console.log(`✓ Found nearest hospital: ${closestHospital.hospitalName} (${minDistance.toFixed(2)} km away)`);
      return { hospital: closestHospital, distance: minDistance };
    }

    return null;
  } catch (error) {
    console.error('Find nearest hospital error:', error);
    return null;
  }
}

/**
 * Auto-assign ambulance to new booking
 */
async function autoAssignAmbulance(booking, io) {
  try {
    let result = await findNearestAmbulance(booking.location.pickup);

    if (!result) {
      console.log(`⚠ No available ambulances for booking ${booking.bookingId}`);
      
      // Add timeline entry
      booking.timeline.push({
        status: 'no-ambulance',
        timestamp: new Date(),
        notes: 'No available ambulances found'
      });
      await booking.save();

      // Notify admin/system
      if (io) {
        io.emit('no-ambulance-available', {
          bookingId: booking.bookingId,
          message: 'No available ambulances at this time'
        });
      }

      return false;
    }

    // Attach driver to fallback ambulance if needed
    if (!result.ambulance.driverId || !result.ambulance.driverId.isOnDuty) {
      const equippedAmbulance = await ensureAmbulanceHasDriver(result.ambulance);
      if (!equippedAmbulance) {
        console.log(`⚠ Could not assign driver to ambulance for booking ${booking.bookingId}`);
        booking.timeline.push({
          status: 'no-ambulance',
          timestamp: new Date(),
          notes: 'No driver available for available ambulance'
        });
        await booking.save();
        if (io) {
          io.emit('no-ambulance-available', {
            bookingId: booking.bookingId,
            message: 'No driver available to staff an ambulance'
          });
        }
        return false;
      }

      result.ambulance = equippedAmbulance;
    }

    console.log(`🚑 Auto-assigning booking ${booking.bookingId} to ${result.ambulance.driverId.name} (${result.distance.toFixed(2)} km away)`);

    // Auto-assign nearest hospital if not already set
    if (!booking.location.destination || !booking.location.destination.hospitalId) {
      const hospitalResult = await findNearestHospital(booking.location.pickup, booking.preferredHospitalId);
      
      if (hospitalResult) {
        booking.location.destination = {
          hospitalId: hospitalResult.hospital._id,
          latitude: hospitalResult.hospital.hospitalLocation.latitude,
          longitude: hospitalResult.hospital.hospitalLocation.longitude,
          address: hospitalResult.hospital.hospitalAddress
        };
        
        console.log(`🏥 Auto-assigned hospital: ${hospitalResult.hospital.hospitalName}`);
      }
    }

    const assigned = await assignBooking(booking, result.ambulance, io);

    if (assigned) {
      // Start reassignment timer
      startReassignmentTimer(booking.bookingId, io);
    }

    return assigned;
  } catch (error) {
    console.error('Auto-assign ambulance error:', error);
    return false;
  }
}

module.exports = {
  autoAssignAmbulance,
  startReassignmentTimer,
  cancelReassignmentTimer,
  checkAndReassign,
  findNearestAmbulance,
  findAvailableDriver,
  ensureAmbulanceHasDriver,
  findNearestHospital,
  REASSIGNMENT_TIMEOUT,
  MAX_REASSIGNMENT_ATTEMPTS
};
