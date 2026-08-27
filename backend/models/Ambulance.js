const mongoose = require('mongoose');

const ambulanceSchema = new mongoose.Schema({
  vehicleNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['basic', 'advanced', 'critical'],
    required: true
  },
  equipment: [{
    name: String,
    status: {
      type: String,
      enum: ['working', 'maintenance', 'broken'],
      default: 'working'
    }
  }],
  currentLocation: {
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  status: {
    type: String,
    enum: ['available', 'busy', 'maintenance', 'offline'],
    default: 'available'
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  baseStation: {
    name: String,
    location: {
      latitude: Number,
      longitude: Number
    }
  },
  serviceArea: [{
    name: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  }],
  lastMaintenance: {
    type: Date
  },
  nextMaintenance: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for geospatial queries
ambulanceSchema.index({ "currentLocation": "2dsphere" });

module.exports = mongoose.model('Ambulance', ambulanceSchema);