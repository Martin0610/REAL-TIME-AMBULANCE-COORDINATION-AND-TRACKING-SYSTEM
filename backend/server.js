const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/booking');
const locationRoutes = require('./routes/location');
const hospitalRoutes = require('./routes/hospital');
const adminRoutes = require('./routes/admin');
const driverRoutes = require('./routes/driver');
const locationCache = require('./utils/location-cache');

const app = express();
const server = http.createServer(app);

// Validate required env vars at startup
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

const ALLOWED_ORIGINS = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(o => o.trim())
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://192.168.0.104:5173',
      'http://192.168.1.40:5173',
      'http://192.168.137.1:5173'
    ];

// Also allow any local network origin dynamically
const io = socketIo(server, {
  cors: {
    origin: function(origin, callback) {
      // Allow requests with no origin (mobile apps, curl) or matching allowed origins
      if (!origin || ALLOWED_ORIGINS.includes(origin) || /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // allow all for development
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // allow all in development
    }
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 200 : 2000,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => req.path === '/health' // skip health checks
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Redirect root to entry.html directly
app.get('/', (req, res) => {
  res.redirect('/entry.html');
});

// Serve static files in production (frontend build)
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'frontend', 'dist');
  const frontendPath = path.join(__dirname, '..', 'frontend');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
  }
  app.use(express.static(frontendPath));
}

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ambulance-system', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('Connected to MongoDB');
  // On startup: ensure all ambulances are available and all drivers are on duty
  try {
    const Ambulance = require('./models/Ambulance');
    const User = require('./models/User');
    const ambResult = await Ambulance.updateMany(
      { status: { $in: ['offline', 'busy'] } },
      { status: 'available' }
    );
    const drvResult = await User.updateMany(
      { role: 'driver', isApproved: true, isActive: true, isOnDuty: false },
      { isOnDuty: true }
    );
    if (ambResult.modifiedCount > 0 || drvResult.modifiedCount > 0) {
      console.log(`✓ Reset ${ambResult.modifiedCount} ambulances to available, ${drvResult.modifiedCount} drivers to on-duty`);
    }
  } catch (err) {
    console.error('Startup reset error:', err.message);
  }
})
.catch(err => console.error('MongoDB connection error:', err));

// Socket.IO for real-time updates (Zomato-style)
io.on('connection', (socket) => {
  console.log('✓ User connected:', socket.id);

  // Join room based on user role
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`✓ User ${socket.id} joined room: ${room}`);
    
    // If joining a booking room, send cached location immediately
    if (room.startsWith('booking-')) {
      const bookingId = room.replace('booking-', '');
      const cachedLocation = locationCache.getDriverForBooking(bookingId);
      if (cachedLocation) {
        socket.emit('ambulance-location', cachedLocation);
        console.log(`📍 Sent cached location for booking: ${bookingId}`);
      }
    }
  });

    // Handle ambulance location updates (optimized like Zomato)
  socket.on('location-update', (data) => {
    const { driverId, bookingId, latitude, longitude, heading, speed } = data;
    
    if (!latitude || !longitude || !bookingId) {
      console.warn('⚠️ Invalid location-update data:', data);
      return;
    }
    
    // Store in cache (skip insignificant moves only if driverId provided)
    if (driverId) {
      if (!locationCache.isSignificantMove(driverId, latitude, longitude)) {
        return; // Skip - driver hasn't moved enough
      }
      
      locationCache.setDriverLocation(driverId, {
        latitude,
        longitude,
        heading,
        speed,
        bookingId
      });
      
      locationCache.setBookingDriver(bookingId, driverId);
    }
    
    // Broadcast to specific booking room (patient is listening here)
    io.to(`booking-${bookingId}`).emit('ambulance-location', {
      bookingId,
      latitude,
      longitude,
      heading,
      speed,
      timestamp: new Date()
    });
    
    // Also broadcast to general tracking room
    io.to('tracking').emit('ambulance-location', data);
    
    console.log(`📍 Location broadcast: booking ${bookingId} → (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`);
  });

  // Handle booking status updates
  socket.on('booking-status', (data) => {
    io.emit('booking-update', data);
  });
  
  // Handle booking completion - cleanup cache
  socket.on('booking-completed', (data) => {
    const { bookingId } = data;
    locationCache.removeBooking(bookingId);
    console.log(`✓ Cleaned up cache for completed booking: ${bookingId}`);
  });

  socket.on('disconnect', () => {
    console.log('✗ User disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/hospital', hospitalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/driver', driverRoutes);

// OSRM proxy — avoids browser mixed-content/CORS issues
app.get('/api/route', async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng } = req.query;
    if (!fromLat || !fromLng || !toLat || !toLng) {
      return res.status(400).json({ error: 'Missing coordinates' });
    }
    const url = `http://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Route fetch failed', message: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = states[mongoose.connection.readyState] || 'unknown';
  res.json({ 
    status: 'OK', 
    database: dbState,
    dbReady: mongoose.connection.readyState === 1,
    timestamp: new Date().toISOString() 
  });
});

// Serve frontend app for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    const distIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
    if (fs.existsSync(distIndex)) {
      res.sendFile(distIndex);
    } else {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} (accessible on all network interfaces)`);
});

module.exports = { app, io };
