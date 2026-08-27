# Design Document: Ambulance Tracking Improvements

## Overview

This design document outlines the technical approach for improving the Smart Ambulance System's real-time tracking capabilities. The improvements focus on three main areas:

1. **Real-time location tracking**: Smooth, animated ambulance marker updates every 10 seconds using Socket.IO
2. **Unified map experience**: Consistent three-marker display (patient 📍, ambulance 🚑, hospital 🏥) across patient and driver portals with automatic bounds fitting
3. **Enhanced information display**: Hospital contact details, criticalness reports, accurate ETA calculations, nearby ambulances/hospitals, and route visualization

The design leverages existing infrastructure (Leaflet maps, Socket.IO, MongoDB) and enhances the frontend JavaScript files to provide a seamless tracking experience.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Patient Portal          Driver Portal      Hospital Portal │
│  - patient-booking.js    - driver-dash.js   - hospital.js   │
│  - Map with 3 markers    - Map with 3      - Incoming list  │
│  - Real-time updates     markers           - Criticalness   │
│  - Nearby ambulances     - Route display   - ETA display    │
│  - Hospital info         - Hospital info                    │
└─────────────────────────────────────────────────────────────┘
                              ↕ Socket.IO + REST API
┌─────────────────────────────────────────────────────────────┐
│                     Backend Layer                           │
├─────────────────────────────────────────────────────────────┤
│  Express Server (server.js)                                │
│  - Socket.IO event handling                                 │
│  - Room-based broadcasting                                  │
│                                                             │
│  Routes                                                     │
│  - /api/booking (booking.js)                               │
│  - /api/driver (driver.js)                                 │
│  - /api/hospital (hospital.js)                             │
│  - /api/location (location.js)                             │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer                              │
├─────────────────────────────────────────────────────────────┤
│  MongoDB Collections                                        │
│  - bookings (Booking model)                                │
│  - users (User model - drivers, hospitals)                 │
│  - ambulances (Ambulance model)                            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

**Location Update Flow:**
```
Driver Browser (Geolocation API)
    → POST /api/driver/update-location
    → Update User.currentLocation & Ambulance.currentLocation
    → Socket.IO emit to booking room
    → Patient/Hospital browsers receive event
    → Update Ambulance_Marker position with animation
```

**Criticalness Report Flow:**
```
Driver submits report
    → POST /api/driver/submit-report/:bookingId
    → Update Booking.driverReport
    → Socket.IO emit 'hospital-incoming' event
    → Hospital browser receives event
    → Display criticalness badge and details
```

## Components and Interfaces

### 1. Enhanced Location Tracking Service

**File:** `frontend/js/patient-booking.js`, `frontend/js/driver-dashboard-new.js`

**Purpose:** Manage real-time location updates with smooth animations

**Key Functions:**

```javascript
// Start location tracking (driver side)
function startLocationTracking() {
  // Use setInterval to send location every 10 seconds
  // Use navigator.geolocation.getCurrentPosition()
  // Emit via Socket.IO and POST to /api/driver/update-location
}

// Update ambulance location with animation (patient/hospital side)
function updateAmbulanceLocationAnimated(lat, lng) {
  // If marker doesn't exist, create it
  // If marker exists, animate to new position using Leaflet's setLatLng with animation
  // Update route polyline if enabled
}

// Socket.IO listener for location updates
socket.on('ambulance-location', (data) => {
  if (data.bookingId === currentBooking.bookingId) {
    updateAmbulanceLocationAnimated(data.latitude, data.longitude);
    updateETA(); // Recalculate ETA
  }
});
```

**Implementation Details:**
- Use `setInterval` with 10-second interval for location updates
- Store interval ID to clear when trip ends
- Use Leaflet's built-in animation by calling `marker.setLatLng([lat, lng])` which animates by default
- Add error handling for geolocation failures

### 2. Unified Map Display Component

**File:** `frontend/js/patient-booking.js`, `frontend/js/driver-dashboard-new.js`

**Purpose:** Display all three markers consistently across portals

**Key Functions:**

```javascript
// Initialize map with all three markers
function initializeUnifiedMap(patientLoc, ambulanceLoc, hospitalLoc) {
  // Create Leaflet map
  const map = L.map('map-container').setView([patientLoc.lat, patientLoc.lng], 13);
  
  // Add tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  
  // Add patient marker (📍)
  const patientMarker = createPatientMarker(patientLoc);
  
  // Add ambulance marker (🚑) if available
  const ambulanceMarker = ambulanceLoc ? createAmbulanceMarker(ambulanceLoc) : null;
  
  // Add hospital marker (🏥) if available
  const hospitalMarker = hospitalLoc ? createHospitalMarker(hospitalLoc) : null;
  
  // Fit bounds to show all markers
  fitMapBounds(map, [patientMarker, ambulanceMarker, hospitalMarker]);
  
  return { map, patientMarker, ambulanceMarker, hospitalMarker };
}

// Create marker with emoji icon
function createMarkerWithEmoji(lat, lng, emoji, size, popupText) {
  const icon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="font-size: ${size}px;">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2]
  });
  
  return L.marker([lat, lng], { icon }).bindPopup(popupText);
}

// Fit map bounds to show all markers
function fitMapBounds(map, markers) {
  const validMarkers = markers.filter(m => m !== null);
  if (validMarkers.length === 0) return;
  
  const bounds = L.latLngBounds(validMarkers.map(m => m.getLatLng()));
  map.fitBounds(bounds, { padding: [50, 50] });
}
```

**Implementation Details:**
- Use `L.divIcon` to create emoji markers (no external images needed)
- Store marker references globally for updates
- Call `fitMapBounds` after adding/updating markers
- Use consistent emoji sizes: 32px for patient/ambulance, 28px for hospital

### 3. Hospital Information Display Component

**File:** `frontend/js/patient-booking.js`, `frontend/js/driver-dashboard-new.js`

**Purpose:** Display hospital contact details consistently

**Key Functions:**

```javascript
// Display hospital information card
function displayHospitalInfo(hospital) {
  const hospitalCard = document.getElementById('hospital-info-card');
  hospitalCard.classList.remove('hidden');
  
  document.getElementById('hospital-name').textContent = hospital.hospitalName || 'N/A';
  document.getElementById('hospital-address').textContent = hospital.hospitalAddress || 'N/A';
  document.getElementById('hospital-email').textContent = hospital.email || 'N/A';
  document.getElementById('hospital-phone').textContent = hospital.phone || 'N/A';
  
  // Add hospital marker to map if not already present
  if (!hospitalMarker && hospital.hospitalLocation) {
    hospitalMarker = createHospitalMarker(
      hospital.hospitalLocation.latitude,
      hospital.hospitalLocation.longitude,
      hospital
    );
    hospitalMarker.addTo(trackingMap);
    fitMapBounds(trackingMap, [patientMarker, ambulanceMarker, hospitalMarker]);
  }
}
```

**HTML Structure (to be added):**
```html
<div id="hospital-info-card" class="info-card hidden">
  <h3><i class="fas fa-hospital"></i> Destination Hospital</h3>
  <div class="detail-row">
    <label>Name:</label>
    <span id="hospital-name">-</span>
  </div>
  <div class="detail-row">
    <label>Address:</label>
    <span id="hospital-address">-</span>
  </div>
  <div class="detail-row">
    <label>Email:</label>
    <span id="hospital-email">-</span>
  </div>
  <div class="detail-row">
    <label>Phone:</label>
    <span id="hospital-phone">-</span>
  </div>
</div>
```

### 4. ETA Calculation Component

**File:** `frontend/js/patient-booking.js`, `frontend/js/hospital-dashboard.js`

**Purpose:** Calculate and display accurate ETA

**Key Functions:**

```javascript
// Calculate distance using Haversine formula
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

// Calculate and display ETA
function updateETA() {
  if (!currentBooking || !currentBooking.driverId?.currentLocation) {
    document.getElementById('eta-time').textContent = 'Calculating...';
    document.getElementById('eta-distance').textContent = 'Distance: Calculating...';
    return;
  }
  
  const driverLoc = currentBooking.driverId.currentLocation;
  const destination = currentBooking.status === 'transporting' 
    ? currentBooking.location.destination 
    : currentBooking.location.pickup;
  
  const distance = calculateDistance(
    driverLoc.latitude,
    driverLoc.longitude,
    destination.latitude,
    destination.longitude
  );
  
  const eta = Math.ceil(distance / 40 * 60); // 40 km/h average speed, result in minutes
  
  document.getElementById('eta-time').textContent = `${eta} min`;
  document.getElementById('eta-distance').textContent = `Distance: ${distance.toFixed(1)} km`;
}
```

**Implementation Details:**
- Recalculate ETA on every location update
- Use 40 km/h as average ambulance speed (accounts for traffic, stops)
- Round up to nearest minute using `Math.ceil`
- Show distance with 1 decimal place
- Handle different destinations: pickup location before pickup, hospital after pickup

### 5. Criticalness Report Display Component

**File:** `frontend/js/hospital-dashboard.js`

**Purpose:** Display driver's patient condition report in hospital portal

**Key Functions:**

```javascript
// Socket.IO listener for criticalness reports
socket.on('hospital-incoming', (data) => {
  console.log('Incoming ambulance with report:', data);
  loadIncomingAmbulances(); // Refresh the list
  showNotification('Critical Patient Report', 
    `${data.booking.patientInfo.name} - ${data.criticalness.toUpperCase()}`);
});

// Display criticalness report in booking card
function displayCriticalnessReport(booking) {
  if (!booking.driverReport || !booking.driverReport.criticalness) {
    return `
      <div class="no-report">
        <i class="fas fa-info-circle"></i>
        <span>Patient condition report pending - driver will submit after pickup</span>
      </div>
    `;
  }
  
  const report = booking.driverReport;
  return `
    <div class="injury-report-section">
      <h4><i class="fas fa-notes-medical"></i> Patient Condition Report</h4>
      <div class="injury-details">
        <div class="injury-row">
          <label>Criticalness Level:</label>
          <span class="criticalness-badge criticalness-${report.criticalness}">
            ${report.criticalness.toUpperCase()}
          </span>
        </div>
        ${report.description ? `
          <div class="injury-row">
            <label>Description:</label>
            <p>${report.description}</p>
          </div>
        ` : ''}
        <div class="injury-row">
          <label>Reported At:</label>
          <span>${new Date(report.reportedAt).toLocaleString()}</span>
        </div>
      </div>
    </div>
  `;
}
```

**CSS Styling:**
```css
.criticalness-badge {
  padding: 4px 12px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
}

.criticalness-low {
  background: #d1fae5;
  color: #065f46;
}

.criticalness-moderate {
  background: #fef3c7;
  color: #92400e;
}

.criticalness-critical {
  background: #fed7aa;
  color: #9a3412;
}

.criticalness-life-threatening {
  background: #fecaca;
  color: #991b1b;
}
```

### 6. Nearby Ambulances Display Component

**File:** `frontend/js/patient-booking.js`

**Purpose:** Show available ambulances near patient location

**Key Functions:**

```javascript
// Load and display nearby ambulances
async function loadNearbyAmbulances(patientLat, patientLng) {
  try {
    const response = await fetch(
      `${CONFIG.API_BASE_URL}/location/nearby-ambulances?latitude=${patientLat}&longitude=${patientLng}&radius=20`
    );
    
    if (!response.ok) return;
    
    const data = await response.json();
    displayNearbyAmbulances(data.ambulances);
  } catch (error) {
    console.error('Load nearby ambulances error:', error);
  }
}

// Display nearby ambulance markers
function displayNearbyAmbulances(ambulances) {
  // Clear existing nearby markers
  nearbyAmbulanceMarkers.forEach(marker => marker.remove());
  nearbyAmbulanceMarkers = [];
  
  ambulances.forEach(ambulance => {
    if (!ambulance.currentLocation) return;
    
    const icon = L.divIcon({
      className: 'custom-marker nearby-ambulance',
      html: '<div style="font-size: 24px; opacity: 0.6;">🚑</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    
    const marker = L.marker(
      [ambulance.currentLocation.latitude, ambulance.currentLocation.longitude],
      { icon }
    ).bindPopup(`
      <b>Available Ambulance</b><br>
      ${ambulance.vehicleNumber}<br>
      Type: ${ambulance.type}
    `).addTo(trackingMap);
    
    nearbyAmbulanceMarkers.push(marker);
  });
}
```

**Backend Route (to be added):**
```javascript
// GET /api/location/nearby-ambulances
router.get('/nearby-ambulances', async (req, res) => {
  const { latitude, longitude, radius = 20 } = req.query;
  
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
  }).limit(10);
  
  res.json({ success: true, ambulances });
});
```

### 7. Nearby Hospitals Display Component

**File:** `frontend/js/patient-booking.js`

**Purpose:** Show hospitals near patient location

**Key Functions:**

```javascript
// Load and display nearby hospitals
async function loadNearbyHospitals(patientLat, patientLng) {
  try {
    const response = await fetch(
      `${CONFIG.API_BASE_URL}/location/nearby-hospitals?latitude=${patientLat}&longitude=${patientLng}&radius=30`
    );
    
    if (!response.ok) return;
    
    const data = await response.json();
    displayNearbyHospitals(data.hospitals);
  } catch (error) {
    console.error('Load nearby hospitals error:', error);
  }
}

// Display nearby hospital markers
function displayNearbyHospitals(hospitals) {
  nearbyHospitalMarkers.forEach(marker => marker.remove());
  nearbyHospitalMarkers = [];
  
  hospitals.forEach(hospital => {
    if (!hospital.hospitalLocation) return;
    
    const icon = L.divIcon({
      className: 'custom-marker nearby-hospital',
      html: '<div style="font-size: 24px; opacity: 0.7;">🏥</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 24]
    });
    
    const marker = L.marker(
      [hospital.hospitalLocation.latitude, hospital.hospitalLocation.longitude],
      { icon }
    ).bindPopup(`
      <b>${hospital.hospitalName}</b><br>
      ${hospital.hospitalAddress}<br>
      <strong>Email:</strong> ${hospital.email}<br>
      <strong>Phone:</strong> ${hospital.phone}
    `).addTo(trackingMap);
    
    nearbyHospitalMarkers.push(marker);
  });
}
```

**Backend Route (to be added):**
```javascript
// GET /api/location/nearby-hospitals
router.get('/nearby-hospitals', async (req, res) => {
  const { latitude, longitude, radius = 30 } = req.query;
  
  const hospitals = await User.find({
    role: 'hospital',
    hospitalLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: radius * 1000
      }
    }
  }).select('hospitalName hospitalAddress hospitalLocation email phone specialties');
  
  res.json({ success: true, hospitals });
});
```

### 8. Optimized Ambulance Assignment Component

**File:** `backend/routes/booking.js`

**Purpose:** Assign nearest available ambulance to booking

**Key Functions:**

```javascript
// Find nearest available ambulance
async function findNearestAmbulance(latitude, longitude, maxDistance = 50) {
  // Find all available ambulances within maxDistance
  const ambulances = await Ambulance.find({
    status: 'available',
    currentLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance * 1000 // Convert km to meters
      }
    }
  }).populate('driverId');
  
  if (ambulances.length === 0) {
    return null;
  }
  
  // Filter for on-duty drivers
  const availableAmbulances = ambulances.filter(amb => 
    amb.driverId && amb.driverId.isOnDuty
  );
  
  if (availableAmbulances.length === 0) {
    return null;
  }
  
  // Calculate distances and sort
  const ambulancesWithDistance = availableAmbulances.map(amb => {
    const distance = calculateDistance(
      latitude,
      longitude,
      amb.currentLocation.latitude,
      amb.currentLocation.longitude
    );
    return { ambulance: amb, distance };
  });
  
  // Sort by distance, then by type (ALS before BLS)
  ambulancesWithDistance.sort((a, b) => {
    if (Math.abs(a.distance - b.distance) < 0.5) {
      // If distances are within 500m, prioritize ALS
      if (a.ambulance.type === 'ALS' && b.ambulance.type === 'BLS') return -1;
      if (a.ambulance.type === 'BLS' && b.ambulance.type === 'ALS') return 1;
    }
    return a.distance - b.distance;
  });
  
  return ambulancesWithDistance[0].ambulance;
}

// Modified booking creation to use nearest ambulance
router.post('/create', async (req, res) => {
  // ... existing validation code ...
  
  // Find nearest ambulance
  const nearestAmbulance = await findNearestAmbulance(
    req.body.location.pickup.latitude,
    req.body.location.pickup.longitude
  );
  
  if (!nearestAmbulance) {
    return res.status(404).json({ 
      error: 'No ambulances available nearby',
      message: 'All ambulances are currently busy or no ambulances within 50 km'
    });
  }
  
  // ... rest of booking creation with nearestAmbulance ...
});
```

**Implementation Details:**
- Use MongoDB's `$near` geospatial query for efficient distance-based search
- Set maximum search radius to 50 km
- Filter for on-duty drivers only
- Prioritize ALS ambulances when distances are similar (within 500m)
- Return clear error message when no ambulances available

### 9. Route Visualization Component

**File:** `frontend/js/patient-booking.js`, `frontend/js/driver-dashboard-new.js`

**Purpose:** Display ambulance's traveled path on map

**Key Functions:**

```javascript
// Initialize route polyline
let routePolyline = null;
let routePoints = [];

function initializeRouteTracking() {
  routePoints = [];
  if (routePolyline) {
    routePolyline.remove();
  }
  
  routePolyline = L.polyline([], {
    color: '#3b82f6',
    weight: 4,
    opacity: 0.7,
    smoothFactor: 1
  }).addTo(trackingMap);
}

// Add point to route when location updates
function addRoutePoint(lat, lng) {
  routePoints.push([lat, lng]);
  
  if (routePolyline) {
    routePolyline.setLatLngs(routePoints);
  }
}

// Update ambulance location with route tracking
function updateAmbulanceLocationWithRoute(lat, lng) {
  // Update marker position
  if (ambulanceMarker) {
    ambulanceMarker.setLatLng([lat, lng]);
  } else {
    ambulanceMarker = createAmbulanceMarker(lat, lng);
    ambulanceMarker.addTo(trackingMap);
  }
  
  // Add to route
  addRoutePoint(lat, lng);
  
  // Update ETA
  updateETA();
}
```

**Implementation Details:**
- Use Leaflet's `L.polyline` to draw the route
- Use blue color (#3b82f6) with 4px width for visibility
- Add each new location to the polyline
- Keep route visible after trip completion
- Initialize route when journey starts (status changes to 'en-route')

### 10. Marker Animation Component

**File:** `frontend/js/patient-booking.js`, `frontend/js/hospital-dashboard.js`

**Purpose:** Smooth animation of ambulance marker movement

**Key Functions:**

```javascript
// Animate marker to new position
function animateMarkerTo(marker, newLat, newLng, duration = 2000) {
  if (!marker) return;
  
  const startLatLng = marker.getLatLng();
  const endLatLng = L.latLng(newLat, newLng);
  
  const startTime = Date.now();
  
  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Linear interpolation
    const lat = startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress;
    const lng = startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress;
    
    marker.setLatLng([lat, lng]);
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }
  
  requestAnimationFrame(animate);
}

// Update ambulance location with smooth animation
function updateAmbulanceLocationSmooth(lat, lng) {
  if (!ambulanceMarker) {
    // Create marker if doesn't exist
    ambulanceMarker = createAmbulanceMarker(lat, lng);
    ambulanceMarker.addTo(trackingMap);
  } else {
    // Animate to new position
    animateMarkerTo(ambulanceMarker, lat, lng, 2000);
  }
  
  // Add to route
  addRoutePoint(lat, lng);
}
```

**Implementation Details:**
- Use `requestAnimationFrame` for smooth 60fps animation
- Linear interpolation between old and new positions
- 2-second duration for natural movement
- Skip animation if marker doesn't exist yet (first update)

## Data Models

### Booking Model Updates

No changes needed to the existing Booking schema. The current schema already supports:
- `driverReport.criticalness` (enum: low, moderate, critical, life-threatening)
- `driverReport.description`
- `driverReport.reportedAt`
- `location.destination.hospitalId` (reference to hospital)

### User Model (Driver) Updates

The existing User schema already has:
- `currentLocation.latitude`
- `currentLocation.longitude`
- `currentLocation.lastUpdated`

No changes needed.

### Ambulance Model Updates

The existing Ambulance schema already has:
- `currentLocation.latitude`
- `currentLocation.longitude`
- `currentLocation.lastUpdated`

Need to add geospatial index for efficient nearby queries:

```javascript
// In backend/models/Ambulance.js
ambulanceSchema.index({ currentLocation: '2dsphere' });
```

### User Model (Hospital) Updates

Need to add geospatial index for nearby hospital queries:

```javascript
// In backend/models/User.js
userSchema.index({ hospitalLocation: '2dsphere' });
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property Reflection and Consolidation

After analyzing all acceptance criteria, several properties can be consolidated to avoid redundancy:

- Hospital information display properties (3.1-3.5, 16.2-16.5, 17.1-17.4) can be combined into comprehensive properties about hospital data display
- Marker display properties (2.1-2.3) can be combined into a single property about three-marker display
- Socket.IO event properties (7.1-7.7) can be consolidated into properties about event emission and room management
- ETA calculation properties (5.1-5.4) can be combined into a single comprehensive ETA property
- Map bounds properties (6.1-6.5) can be consolidated into properties about automatic bounds fitting

### Core Properties

**Property 1: Location Update Interval**
*For any* active trip where the driver has started the journey, location updates SHALL be transmitted every 10 seconds (±1 second tolerance) via Socket.IO to the booking room.
**Validates: Requirements 1.1, 9.1**

**Property 2: Real-Time Marker Position Update**
*For any* location update event received by the Patient_Portal or Hospital_Portal, the Ambulance_Marker position SHALL be update