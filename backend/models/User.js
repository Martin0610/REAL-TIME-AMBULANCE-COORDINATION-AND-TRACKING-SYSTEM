const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      return this.role !== 'patient';
    }
  },
  role: {
    type: String,
    enum: ['patient', 'driver', 'hospital', 'admin'],
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isApproved: {
    type: Boolean,
    default: function() {
      return this.role !== 'driver' && this.role !== 'hospital';
    }
  },
  // Driver specific fields
  licenseNumber: {
    type: String,
    required: function() {
      return this.role === 'driver';
    }
  },
  ambulanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ambulance',
    required: function() {
      // Only required for approved drivers
      return this.role === 'driver' && this.isApproved === true;
    }
  },
  currentLocation: {
    latitude: Number,
    longitude: Number,
    timestamp: Date
  },
  isOnDuty: {
    type: Boolean,
    default: false
  },
  // Hospital specific fields
  hospitalName: {
    type: String,
    required: function() {
      return this.role === 'hospital';
    }
  },
  hospitalAddress: {
    type: String,
    required: function() {
      return this.role === 'hospital';
    }
  },
  hospitalLocation: {
    latitude: {
      type: Number,
      required: function() {
        return this.role === 'hospital';
      }
    },
    longitude: {
      type: Number,
      required: function() {
        return this.role === 'hospital';
      }
    }
  },
  capacity: {
    type: Number,
    default: 0
  },
  specialties: [{
    type: String
  }]
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);
