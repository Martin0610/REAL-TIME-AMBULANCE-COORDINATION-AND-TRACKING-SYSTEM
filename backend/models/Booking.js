const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    unique: true,
    default: function() {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substr(2, 9);
      return `AMB-${timestamp}-${random}`.toUpperCase();
    }
  },
  patientInfo: {
    name: {
      type: String,
      trim: true,
      default: 'Unknown'
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    age: {
      type: Number,
      min: 0,
      max: 150
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other']
    }
  },
  emergencyDetails: {
    severity: {
      type: Number,
      min: 1,
      max: 5,
      default: 3
    },
    description: {
      type: String,
      trim: true,
      default: 'Emergency reported'
    },
    symptoms: [String],
    isConscious: {
      type: Boolean,
      default: true
    }
  },
  callerType: {
    type: String,
    enum: ['patient', 'bystander'],
    default: 'patient'
  },
  patientCount: {
    type: Number,
    min: 1,
    max: 10,
    default: 1
  },
  incidentType: {
    type: String,
    trim: true,
    default: 'medical'
  },
  preferredHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  location: {
    pickup: {
      latitude: {
        type: Number,
        required: true
      },
      longitude: {
        type: Number,
        required: true
      },
      address: {
        type: String,
        required: true
      },
      landmark: String
    },
    destination: {
      hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      latitude: Number,
      longitude: Number,
      address: String
    }
  },
  ambulanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ambulance'
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'assigned', 'accepted', 'en-route', 'arrived', 'picked-up', 'transporting', 'completed', 'cancelled'],
    default: 'pending'
  },
  driverAcceptance: {
    accepted: {
      type: Boolean,
      default: false
    },
    acceptedAt: Date,
    responseTime: Number // in seconds
  },
  timeline: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    location: {
      latitude: Number,
      longitude: Number
    },
    notes: String
  }],
  estimatedArrival: {
    type: Date
  },
  actualArrival: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  feedback: {
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String, default: '' },
    submittedAt: { type: Date }
  },
  distance: {
    type: Number // in kilometers
  },
  duration: {
    type: Number // in minutes
  },
  fare: {
    baseFare: Number,
    distanceFare: Number,
    emergencyFare: Number,
    total: Number
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  rating: {
    score: {
      type: Number,
      min: 1,
      max: 5
    },
    feedback: String,
    ratedAt: Date
  },
  cancelledBy: {
    type: String,
    enum: ['patient', 'driver', 'admin']
  },
  cancellationReason: String,
  driverReport: {
    criticalness: {
      type: String,
      enum: ['low', 'moderate', 'critical', 'life-threatening'],
      default: undefined
    },
    description: {
      type: String,
      trim: true
    },
    vitalSigns: {
      bloodPressure: String,
      heartRate: String,
      oxygenLevel: String,
      temperature: String
    },
    reportedAt: Date,
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sentToHospital: {
      type: Boolean,
      default: false
    },
    sentAt: Date
  },
  reassignmentAttempts: [{
    ambulanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ambulance'
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'no-response'],
      default: 'pending'
    },
    acceptedAt: Date,
    failedAt: Date
  }]
}, {
  timestamps: true
});

// Index for geospatial queries
bookingSchema.index({ "location.pickup": "2dsphere" });
// Note: destination is not indexed as 2dsphere since it's not in GeoJSON format

module.exports = mongoose.model('Booking', bookingSchema);
