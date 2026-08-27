# Requirements Document

## Introduction

This document specifies the requirements for improving the Smart Ambulance System's real-time tracking and map visualization features. The system currently has basic tracking functionality but needs refinements to provide a unified, smooth, and informative experience across patient, driver, and hospital portals. The improvements focus on real-time ambulance location updates, consistent map displays with all relevant markers, accurate ETA calculations, and proper display of hospital and criticalness information.

## Glossary

- **Patient_Portal**: The web interface used by patients to book ambulances and track their arrival
- **Driver_Portal**: The web interface used by ambulance drivers to accept bookings and navigate to patients
- **Hospital_Portal**: The web interface used by hospitals to monitor incoming ambulances
- **Ambulance_Marker**: The 🚑 emoji marker representing the ambulance's current location on the map
- **Patient_Marker**: The 📍 emoji marker representing the patient's pickup location on the map
- **Hospital_Marker**: The 🏥 emoji marker representing the destination hospital on the map
- **Real_Time_Update**: Location data transmitted every 10 seconds via Socket.IO
- **Criticalness_Report**: Driver's assessment of patient condition (low, moderate, critical, life-threatening)
- **ETA**: Estimated Time of Arrival calculated based on distance and average speed
- **Map_Bounds**: The visible area of the map automatically adjusted to show all markers
- **Socket_IO**: Real-time bidirectional event-based communication library
- **Leaflet**: Open-source JavaScript library for interactive maps

## Requirements

### Requirement 1: Real-Time Ambulance Location Updates

**User Story:** As a patient or hospital staff member, I want to see the ambulance location update smoothly in real-time, so that I can accurately track its progress.

#### Acceptance Criteria

1. WHEN the driver starts the journey, THE System SHALL begin transmitting location updates every 10 seconds via Socket.IO
2. WHEN a location update is received, THE Patient_Portal SHALL update the Ambulance_Marker position smoothly without page refresh
3. WHEN a location update is received, THE Hospital_Portal SHALL update the Ambulance_Marker position smoothly without page refresh
4. WHEN the ambulance is moving, THE Ambulance_Marker SHALL animate smoothly between positions rather than jumping
5. WHEN location updates are received, THE System SHALL emit the updates to the correct booking room via Socket.IO

### Requirement 2: Unified Map Display

**User Story:** As a user of the system, I want to see a consistent map with all three markers (patient, ambulance, hospital) on both patient and driver pages, so that I have complete situational awareness.

#### Acceptance Criteria

1. WHEN a booking is assigned to a driver, THE Patient_Portal SHALL display all three markers: Patient_Marker, Ambulance_Marker, and Hospital_Marker
2. WHEN a driver views the current trip, THE Driver_Portal SHALL display all three markers: Patient_Marker, Ambulance_Marker, and Hospital_Marker
3. WHEN any of the three markers are displayed, THE System SHALL use the correct emoji icons (📍 for patient, 🚑 for ambulance, 🏥 for hospital)
4. WHEN the map is initialized, THE System SHALL automatically fit Map_Bounds to show all three markers with appropriate padding
5. WHEN new markers are added or positions update, THE System SHALL adjust Map_Bounds to keep all markers visible

### Requirement 3: Hospital Information Display

**User Story:** As a patient or driver, I want to see hospital contact details (email and phone) on my interface, so that I can contact the hospital if needed.

#### Acceptance Criteria

1. WHEN a hospital is assigned as the destination, THE Patient_Portal SHALL display the hospital email address
2. WHEN a hospital is assigned as the destination, THE Patient_Portal SHALL display the hospital phone number
3. WHEN a hospital is assigned as the destination, THE Driver_Portal SHALL display the hospital email address
4. WHEN a hospital is assigned as the destination, THE Driver_Portal SHALL display the hospital phone number
5. WHEN hospital information is displayed, THE System SHALL show the hospital name, address, email, and phone in a clearly labeled format

### Requirement 4: Criticalness Report Display in Hospital Portal

**User Story:** As hospital staff, I want to see the driver's criticalness report immediately after it's submitted, so that I can prepare appropriate medical resources.

#### Acceptance Criteria

1. WHEN a driver submits a Criticalness_Report, THE System SHALL send the report to the Hospital_Portal in real-time via Socket.IO
2. WHEN a Criticalness_Report is received, THE Hospital_Portal SHALL display the criticalness level with appropriate visual styling
3. WHEN a Criticalness_Report includes a description, THE Hospital_Portal SHALL display the description text
4. WHEN a Criticalness_Report is displayed, THE System SHALL show the timestamp when the report was submitted
5. WHEN no Criticalness_Report has been submitted yet, THE Hospital_Portal SHALL display a pending message indicating the report will be available after patient pickup

### Requirement 5: Accurate ETA Calculation and Display

**User Story:** As a patient or hospital staff member, I want to see an accurate estimated time of arrival, so that I can plan accordingly.

#### Acceptance Criteria

1. WHEN the ambulance location is available, THE System SHALL calculate ETA based on the straight-line distance between ambulance and destination
2. WHEN calculating ETA, THE System SHALL use an average speed of 40 km/h
3. WHEN displaying ETA, THE System SHALL show the time in minutes rounded up to the nearest minute
4. WHEN displaying ETA, THE System SHALL also show the distance in kilometers with one decimal place
5. WHEN the ambulance location updates, THE System SHALL recalculate and update the ETA display
6. WHEN the ambulance location is not yet available, THE System SHALL display "Calculating..." for the ETA

### Requirement 6: Automatic Map Bounds Adjustment

**User Story:** As a user viewing the map, I want the map to automatically zoom and pan to show all relevant markers, so that I don't have to manually adjust the view.

#### Acceptance Criteria

1. WHEN the map is first initialized with markers, THE System SHALL calculate Map_Bounds that include all markers
2. WHEN Map_Bounds are calculated, THE System SHALL add 50 pixels of padding on all sides
3. WHEN a new marker is added to the map, THE System SHALL recalculate and adjust Map_Bounds to include the new marker
4. WHEN the Ambulance_Marker position updates, THE System SHALL check if it's still within Map_Bounds and adjust if necessary
5. WHEN adjusting Map_Bounds, THE System SHALL animate the transition smoothly rather than jumping

### Requirement 7: Socket.IO Real-Time Communication

**User Story:** As a system administrator, I want reliable real-time communication between client and server, so that location updates are delivered promptly.

#### Acceptance Criteria

1. WHEN a user connects to the system, THE System SHALL establish a Socket.IO connection
2. WHEN a booking is created or assigned, THE System SHALL join the client to the appropriate booking room
3. WHEN the driver updates location, THE System SHALL emit the location data to the booking room
4. WHEN location data is emitted, THE System SHALL include bookingId, latitude, longitude, and timestamp
5. WHEN a client receives a location update event, THE System SHALL verify the bookingId matches the current booking before updating the map
6. WHEN the driver submits a Criticalness_Report, THE System SHALL emit a hospital-incoming event to the hospital room
7. WHEN any booking status changes, THE System SHALL emit a booking-update event to all relevant rooms

### Requirement 8: Smooth Marker Animation

**User Story:** As a user watching the ambulance location, I want the marker to move smoothly between positions, so that the tracking feels natural and professional.

#### Acceptance Criteria

1. WHEN the Ambulance_Marker position is updated, THE System SHALL animate the transition over 1 second
2. WHEN animating marker movement, THE System SHALL use a smooth easing function
3. WHEN multiple location updates arrive rapidly, THE System SHALL queue them and animate smoothly to each position
4. WHEN the map is not visible, THE System SHALL still update marker positions but skip animations
5. WHEN the user manually pans or zooms the map, THE System SHALL not interfere with user interaction

### Requirement 9: Location Update Backend Integration

**User Story:** As a driver, I want my location to be automatically transmitted while I'm on a trip, so that patients and hospitals can track my progress.

#### Acceptance Criteria

1. WHEN the driver starts a journey, THE Driver_Portal SHALL begin sending location updates every 10 seconds
2. WHEN sending location updates, THE System SHALL use the browser's Geolocation API to get current position
3. WHEN a location update is sent, THE System SHALL update the driver's currentLocation in the database
4. WHEN a location update is sent, THE System SHALL update the associated ambulance's currentLocation in the database
5. WHEN a location update is sent, THE System SHALL emit the location via Socket.IO to the booking room
6. WHEN the trip is completed or cancelled, THE System SHALL stop sending location updates

### Requirement 10: Hospital Marker Popup Information

**User Story:** As a user viewing the map, I want to click on the hospital marker to see detailed information, so that I can quickly access hospital details.

#### Acceptance Criteria

1. WHEN the Hospital_Marker is added to the map, THE System SHALL bind a popup with hospital information
2. WHEN the popup is displayed, THE System SHALL show the hospital name as a heading
3. WHEN the popup is displayed, THE System SHALL show the hospital address
4. WHEN the popup is displayed, THE System SHALL show the hospital email
5. WHEN the popup is displayed, THE System SHALL show the hospital phone number

### Requirement 11: Nearby Ambulance Display in Patient Portal

**User Story:** As a patient booking an ambulance, I want to see nearby available ambulances on the map, so that I understand which ambulances are in my area.

#### Acceptance Criteria

1. WHEN the Patient_Portal loads, THE System SHALL display markers for all available ambulances within a 20 km radius
2. WHEN displaying nearby ambulances, THE System SHALL use the 🚑 emoji marker with a different color or style to distinguish from the assigned ambulance
3. WHEN an ambulance is assigned to the booking, THE System SHALL highlight that ambulance marker differently from other nearby ambulances
4. WHEN nearby ambulances are displayed, THE System SHALL show their vehicle number in the marker popup
5. WHEN the booking is assigned, THE System SHALL remove or fade the markers for other nearby ambulances

### Requirement 12: Nearby Hospital Display in Patient Portal

**User Story:** As a patient booking an ambulance, I want to see nearby hospitals on the map during booking, so that I know which hospitals are available.

#### Acceptance Criteria

1. WHEN the Patient_Portal loads, THE System SHALL display markers for all hospitals within a 30 km radius
2. WHEN displaying hospital markers, THE System SHALL use the 🏥 emoji marker
3. WHEN a hospital marker is clicked, THE System SHALL show a popup with hospital name, address, email, and phone
4. WHEN a hospital is assigned as the destination, THE System SHALL highlight that hospital marker differently
5. WHEN displaying multiple hospitals, THE System SHALL ensure markers are visible and not overlapping

### Requirement 13: Optimized Ambulance Assignment by Distance

**User Story:** As a patient, I want the nearest available ambulance to be assigned to my booking, so that I receive the fastest possible response.

#### Acceptance Criteria

1. WHEN a booking is created, THE System SHALL calculate the distance from the patient location to all available ambulances
2. WHEN calculating distances, THE System SHALL use the Haversine formula for accurate geographic distance
3. WHEN selecting an ambulance, THE System SHALL prioritize the ambulance with the shortest distance to the patient
4. WHEN multiple ambulances are equidistant, THE System SHALL select based on ambulance type priority (ALS before BLS)
5. WHEN an ambulance is assigned, THE System SHALL verify it is within the service area before assignment
6. WHEN no ambulances are available within 50 km, THE System SHALL return an error indicating no nearby ambulances

### Requirement 14: Ambulance Route Visualization

**User Story:** As a patient or hospital staff member, I want to see the route the ambulance is taking, so that I can understand its path and progress.

#### Acceptance Criteria

1. WHEN the ambulance starts moving, THE System SHALL draw a polyline on the map showing the ambulance's traveled path
2. WHEN drawing the route, THE System SHALL use a distinct color (e.g., blue or green) to differentiate from other map elements
3. WHEN the ambulance location updates, THE System SHALL add the new position to the route polyline
4. WHEN the route is displayed, THE System SHALL set the polyline width to 4 pixels for visibility
5. WHEN the trip is completed, THE System SHALL keep the full route visible on the map

### Requirement 15: Animated Ambulance Movement

**User Story:** As a user watching the map, I want to see the ambulance marker move smoothly along the route, so that the tracking feels realistic and engaging.

#### Acceptance Criteria

1. WHEN a new ambulance location is received, THE System SHALL animate the Ambulance_Marker from its current position to the new position
2. WHEN animating movement, THE System SHALL use a duration of 2 seconds for smooth transition
3. WHEN animating movement, THE System SHALL use a linear interpolation between positions
4. WHEN multiple updates arrive during animation, THE System SHALL queue them and animate sequentially
5. WHEN the ambulance is stationary (same location for 30 seconds), THE System SHALL stop animation

### Requirement 16: Hospital Information During Booking

**User Story:** As a patient booking an ambulance, I want to see which hospital I will be taken to during the booking process, so that I can be informed about my destination.

#### Acceptance Criteria

1. WHEN a booking is created, THE System SHALL assign the nearest appropriate hospital as the destination
2. WHEN the booking form is displayed, THE System SHALL show the assigned hospital name
3. WHEN the booking form is displayed, THE System SHALL show the assigned hospital address
4. WHEN the booking form is displayed, THE System SHALL show the assigned hospital email
5. WHEN the booking form is displayed, THE System SHALL show the assigned hospital phone number

### Requirement 17: Hospital Destination Display After Criticalness Report

**User Story:** As a patient or family member, I want to see which hospital the ambulance is heading to after the patient is picked up, so that I know where to go.

#### Acceptance Criteria

1. WHEN the driver submits the Criticalness_Report, THE Patient_Portal SHALL display the destination hospital name prominently
2. WHEN the hospital destination is displayed, THE System SHALL show the hospital email address
3. WHEN the hospital destination is displayed, THE System SHALL show the hospital phone number
4. WHEN the hospital destination is displayed, THE System SHALL show the hospital address
5. WHEN the status changes to "transporting", THE Patient_Portal SHALL highlight the hospital information section
