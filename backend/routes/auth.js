const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');
const Ambulance = require('../models/Ambulance');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('driver', 'hospital', 'admin').required()
});

const registerDriverSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).required(),
  phone: Joi.string().pattern(/^[0-9]{10}$/).required(),
  licenseNumber: Joi.string().required(),
  ambulanceId: Joi.string().required()
});

const registerHospitalSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  hospitalName: Joi.string().min(2).required(),
  phone: Joi.string().pattern(/^[0-9]{10}$/).required(),
  hospitalAddress: Joi.string().required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  capacity: Joi.number().min(0).default(0),
  specialties: Joi.array().items(Joi.string())
});

// Generate JWT token
const generateToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, role } = req.body;

    // Find user by email and role
    const user = await User.findOne({ email, role }).populate('ambulanceId');
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Generate token
    const token = generateToken(user._id, user.role);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        ...(user.role === 'driver' && {
          licenseNumber: user.licenseNumber,
          ambulanceId: user.ambulanceId,
          isOnDuty: user.isOnDuty,
          currentLocation: user.currentLocation
        }),
        ...(user.role === 'hospital' && {
          hospitalName: user.hospitalName,
          hospitalAddress: user.hospitalAddress,
          hospitalLocation: user.hospitalLocation,
          capacity: user.capacity,
          specialties: user.specialties
        })
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register driver
router.post('/register/driver', async (req, res) => {
  try {
    const { error } = registerDriverSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, name, phone, licenseNumber, ambulanceId } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Check if ambulance exists and is available
    const ambulance = await Ambulance.findById(ambulanceId);
    if (!ambulance) {
      return res.status(400).json({ error: 'Invalid ambulance ID' });
    }

    if (ambulance.driverId) {
      return res.status(400).json({ error: 'Ambulance already assigned to another driver' });
    }

    // Create new driver
    const driver = new User({
      email,
      password,
      name,
      phone,
      role: 'driver',
      licenseNumber,
      ambulanceId
    });

    await driver.save();

    // Assign driver to ambulance
    ambulance.driverId = driver._id;
    await ambulance.save();

    const token = generateToken(driver._id, driver.role);

    res.status(201).json({
      token,
      user: {
        id: driver._id,
        email: driver.email,
        name: driver.name,
        role: driver.role,
        phone: driver.phone,
        licenseNumber: driver.licenseNumber,
        ambulanceId: driver.ambulanceId,
        isOnDuty: driver.isOnDuty
      }
    });
  } catch (error) {
    console.error('Driver registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register hospital
router.post('/register/hospital', async (req, res) => {
  try {
    const { error } = registerHospitalSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { 
      email, password, hospitalName, phone, hospitalAddress, 
      latitude, longitude, capacity, specialties 
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new hospital
    const hospital = new User({
      email,
      password,
      name: hospitalName,
      phone,
      role: 'hospital',
      hospitalName,
      hospitalAddress,
      hospitalLocation: {
        latitude,
        longitude
      },
      capacity: capacity || 0,
      specialties: specialties || []
    });

    await hospital.save();

    const token = generateToken(hospital._id, hospital.role);

    res.status(201).json({
      token,
      user: {
        id: hospital._id,
        email: hospital.email,
        name: hospital.name,
        role: hospital.role,
        phone: hospital.phone,
        hospitalName: hospital.hospitalName,
        hospitalAddress: hospital.hospitalAddress,
        hospitalLocation: hospital.hospitalLocation,
        capacity: hospital.capacity,
        specialties: hospital.specialties
      }
    });
  } catch (error) {
    console.error('Hospital registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate('ambulanceId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update driver duty status
router.patch('/driver/duty', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { isOnDuty } = req.body;
    
    const driver = await User.findByIdAndUpdate(
      req.user.userId,
      { isOnDuty },
      { new: true }
    ).populate('ambulanceId');

    // Update ambulance status
    if (driver.ambulanceId) {
      await Ambulance.findByIdAndUpdate(
        driver.ambulanceId._id,
        { status: isOnDuty ? 'available' : 'offline' }
      );
    }

    res.json({ user: driver });
  } catch (error) {
    console.error('Update duty status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Driver registration request (pending admin approval)
router.post('/register/driver-request', async (req, res) => {
  try {
    const { name, phone, email, licenseNumber, password } = req.body;

    // Validation
    if (!name || !phone || !email || !licenseNumber || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (phone.length !== 10) {
      return res.status(400).json({ error: 'Phone number must be 10 digits' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create driver with pending approval status
    const driver = new User({
      email,
      password,
      name,
      phone,
      role: 'driver',
      licenseNumber,
      isActive: false, // Inactive until admin approves
      isApproved: false // Not approved yet - ambulanceId not required
    });

    await driver.save();

    console.log('✓ Driver registration request created:', email);

    res.status(201).json({
      message: 'Registration request submitted successfully. You will receive an email once approved by admin.',
      email: email
    });
  } catch (error) {
    console.error('Driver registration request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Hospital registration request (pending admin approval)
router.post('/register/hospital-request', async (req, res) => {
  try {
    const { hospitalName, email, phone, hospitalAddress, capacity, specialties, password } = req.body;

    // Parse specialties — handle both array and JSON string
    let specialtiesArray = specialties;
    if (typeof specialties === 'string') {
      try { specialtiesArray = JSON.parse(specialties); } catch(e) { specialtiesArray = [specialties]; }
    }
    if (!Array.isArray(specialtiesArray)) specialtiesArray = [];

    // Validation
    if (!hospitalName || !email || !phone || !hospitalAddress || !capacity || !password) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    if (phone.length !== 10) {
      return res.status(400).json({ error: 'Phone number must be 10 digits' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (!specialtiesArray || specialtiesArray.length === 0) {
      return res.status(400).json({ error: 'Please select at least one facility' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // For now, create user directly (later add approval workflow)
    const hospital = new User({
      email,
      password,
      name: hospitalName,
      phone,
      role: 'hospital',
      hospitalName,
      hospitalAddress,
      hospitalLocation: {
        latitude: 12.9249, // Default to Tambaram for now
        longitude: 80.1000
      },
      capacity: parseInt(capacity),
      specialties: specialtiesArray,
      isActive: false, // Inactive until admin approves
      isApproved: false
    });

    await hospital.save();

    console.log('✓ Hospital registration request created:', email);

    res.status(201).json({
      message: 'Registration request submitted successfully. You will receive an email once approved by admin.',
      email: email
    });
  } catch (error) {
    console.error('Hospital registration request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update duty status (driver only)
router.patch('/duty-status', authenticateToken, async (req, res) => {
  try {
    const { isOnDuty } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can update duty status' });
    }

    user.isOnDuty = isOnDuty;
    await user.save();

    // Update ambulance status if assigned
    if (user.ambulanceId) {
      const Ambulance = require('../models/Ambulance');
      await Ambulance.findByIdAndUpdate(user.ambulanceId, {
        status: isOnDuty ? 'available' : 'offline'
      });
    }

    console.log(`✓ Driver ${user.name} is now ${isOnDuty ? 'on' : 'off'} duty`);

    res.json({
      success: true,
      message: 'Duty status updated',
      isOnDuty
    });
  } catch (error) {
    console.error('Update duty status error:', error);
    res.status(500).json({ error: 'Failed to update duty status' });
  }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password')
      .populate('ambulanceId', 'vehicleNumber type status');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Update driver duty status
router.patch('/duty-status', authenticateToken, async (req, res) => {
  try {
    const { isOnDuty } = req.body;
    if (typeof isOnDuty !== 'boolean') {
      return res.status(400).json({ error: 'isOnDuty must be a boolean' });
    }

    await User.findByIdAndUpdate(req.user.userId, { isOnDuty });

    // Also update ambulance status accordingly
    const driver = await User.findById(req.user.userId);
    if (driver.ambulanceId) {
      await Ambulance.findByIdAndUpdate(driver.ambulanceId, {
        status: isOnDuty ? 'available' : 'offline'
      });
    }

    console.log(`✓ Driver ${req.user.userId} duty status: ${isOnDuty ? 'On Duty' : 'Off Duty'}`);
    res.json({ success: true, isOnDuty });
  } catch (error) {
    console.error('Duty status update error:', error);
    res.status(500).json({ error: 'Failed to update duty status' });
  }
});

module.exports = router;


// Send OTP for email verification
const { sendEmail } = require('../utils/email');
const otpStore = new Map(); // In production, use Redis

router.post('/send-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }
    
    // Store OTP with expiry (10 minutes)
    otpStore.set(email, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    
    // Send email
    try {
      await sendEmail({
        to: email,
        subject: 'Email Verification - Smart Ambulance System',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">🚑 Smart Ambulance System</h1>
            </div>
            <div style="padding: 40px; background: #f8fafc;">
              <h2 style="color: #1e293b; margin-bottom: 20px;">Verify Your Email</h2>
              <p style="color: #64748b; font-size: 16px; line-height: 1.6;">
                Thank you for registering with Smart Ambulance System. Please use the following OTP to verify your email address:
              </p>
              <div style="background: white; padding: 30px; text-align: center; border-radius: 12px; margin: 30px 0;">
                <div style="font-size: 36px; font-weight: bold; color: #3b82f6; letter-spacing: 8px;">
                  ${otp}
                </div>
              </div>
              <p style="color: #64748b; font-size: 14px;">
                This OTP is valid for 10 minutes. Please do not share this code with anyone.
              </p>
              <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                If you didn't request this verification, please ignore this email.
              </p>
            </div>
            <div style="background: #1e293b; padding: 20px; text-align: center;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                © 2024 Smart Ambulance System. All rights reserved.
              </p>
            </div>
          </div>
        `,
        text: `Your OTP for email verification is: ${otp}. Valid for 10 minutes.`
      });
      
      res.json({ success: true, message: 'OTP sent successfully' });
    } catch (emailError) {
      console.error('Email send error:', emailError);
      // Still return success for testing, but log the error
      res.json({ success: true, message: 'OTP generated (email not configured)' });
    }
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }
    
    const storedData = otpStore.get(email);
    
    if (!storedData) {
      return res.status(400).json({ error: 'OTP not found or expired' });
    }
    
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ error: 'OTP expired' });
    }
    
    if (storedData.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    
    // OTP verified, remove from store
    otpStore.delete(email);
    
    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});
