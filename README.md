# 🚑 Smart Ambulance Coordination & Real-Time Tracking System

[![Node.js](https://img.shields.io/badge/Node.js-v16+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.18-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-7.5-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Leaflet](https://img.shields.io/badge/Leaflet-Maps-199900?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![Render](https://img.shields.io/badge/Render-Deployed-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)

> An intelligent, real-time emergency medical dispatch and fleet coordination platform designed to minimize emergency response times. It seamlessly connects patients in distress, ambulance drivers, hospitals, and central dispatchers using live WebSocket telemetry and interactive GPS mapping.

---

## 🌐 Live Production Demo

- **Application URL:** [https://real-time-ambulance-coordination-and.onrender.com](https://real-time-ambulance-coordination-and.onrender.com)
- **Patient Booking:** [https://real-time-ambulance-coordination-and.onrender.com/patient-booking.html](https://real-time-ambulance-coordination-and.onrender.com/patient-booking.html)
- **Provider / Driver Portal:** [https://real-time-ambulance-coordination-and.onrender.com/provider-login.html](https://real-time-ambulance-coordination-and.onrender.com/provider-login.html)
- **Health Check & DB Status:** [https://real-time-ambulance-coordination-and.onrender.com/health](https://real-time-ambulance-coordination-and.onrender.com/health)

---

## 🎯 Key Portals & Features

### 1. 🚨 Patient Emergency Portal (entry.html & patient-booking.html)
- **One-Tap Emergency SOS:** Instant dispatch with automatic GPS detection and reverse-geocoding via OpenStreetMap Nominatim.
- **Live Ambulance GPS Tracking:** Zomato/Uber-style continuous live vehicle movement with smooth interpolation and directional heading rotation.
- **Dynamic Turn-by-Turn ETA:** Real-world road routing and estimated arrival time calculated using the OSRM (Open Source Routing Machine) engine.
- **Interactive First-Aid AI Assistant:** 18+ first-aid emergency topics (Cardiac Arrest, Stroke, Bleeding, Burns, Choking, etc.) providing step-by-step medical instructions while help is en route.
- **Dark Mode & High Contrast UI:** Fully accessible design with instant theme toggling and zero layout shift.

### 2. 🚖 Driver Dashboard (driver-dashboard.html)
- **Real-Time GPS Broadcast:** Streams high-frequency coordinate updates over WebSockets with client-side dead-reckoning and backend cache deduplication.
- **Turn-by-Turn Navigation:** Live driving directions from current ambulance position to patient pickup point.
- **Full Trip Lifecycle:** Assigned → Accepted → En Route → Arrived → Patient Picked Up → Transporting → Completed.

### 3. 🏥 Hospital Portal (hospital-dashboard.html)
- **Incoming Emergency Stream:** Real-time visibility into arriving ambulances, patient condition severity levels (1 to 5), and estimated times of arrival.
- **Bed & Emergency Unit Management:** Live capacity and specialty management to ensure triage readiness.

### 4. 🛡️ Administrator Portal (dmin-dashboard.html)
- **Provider Verification & Approval:** Admin gatekeeping for verifying ambulance driver licenses, vehicle registration, and hospital credentials.
- **Live Fleet Map:** Bird's-eye view of all on-duty ambulances across the coverage zones (Chennai metropolitan and surrounding regions).

---

## 🏗️ System Architecture

`
                 +-----------------------------------------------+
                 |             Browser Client Layer              |
                 |  (Patient Booking / Driver / Hospital / Admin)|
                 +-----------------------+-----------------------+
                                         |
                  HTTP / REST            |  Bidirectional WebSockets
                  (Auth, Bookings)       |  (GPS Telemetry, Rooms)
                                         v
                 +-----------------------------------------------+
                 |             Node.js Express Server            |
                 |-----------------------------------------------|
                 | - JWT Authentication & RBAC Middleware        |
                 | - Socket.IO Room Coordination (booking-xxx)   |
                 | - Location Cache & Movement Throttling Engine |
                 | - OSRM Routing Proxy                          |
                 +-----------------------+-----------------------+
                                         |
                       Mongoose ODM      |  Cloud Driver
                                         v
                 +-----------------------------------------------+
                 |               MongoDB Atlas                   |
                 |   (Users, Ambulances, Bookings, Hospitals)    |
                 +-----------------------------------------------+
`

---

## 💻 Tech Stack

| Domain | Technologies & Libraries |
| :--- | :--- |
| **Backend** | Node.js, Express.js, Socket.IO, Mongoose, JWT (jsonwebtoken), Bcrypt.js, Helmet, Express-Rate-Limit, Joi |
| **Frontend** | HTML5, CSS3, JavaScript (ES6+ Modules), Leaflet.js, OpenStreetMap, FontAwesome, Vite |
| **Routing / Maps** | Project OSRM (Open Source Routing Machine), Leaflet MovingMarker |
| **Database** | MongoDB Atlas (Cloud Managed NoSQL) |
| **Hosting** | Render (Web Services with persistent WebSocket support) |

---

## 🔑 Demo Credentials

Use these verified credentials to test out the live portal:

| Role | Email | Password | Access Portal |
| :--- | :--- | :--- | :--- |
| **Ambulance Driver** | mjv3140@gmail.com | driver123 | /provider-login.html (Ambulance Driver) |
| **System Admin** | dmin@ambulance.com | dmin123 | /provider-login.html (Administrator) |
| **Driver 2** | ajesh@driver.com | driver123 | /provider-login.html (Ambulance Driver) |

---

## 🚀 Local Development Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (version 16 or higher)
- [MongoDB](https://www.mongodb.com/) (local instance or free MongoDB Atlas cluster)
- Git

### 2. Clone the Repository
`ash
git clone https://github.com/Martin0610/REAL-TIME-AMBULANCE-COORDINATION-AND-TRACKING-SYSTEM.git
cd REAL-TIME-AMBULANCE-COORDINATION-AND-TRACKING-SYSTEM
`

### 3. Install Dependencies
`ash
# Installs both backend and frontend dependencies
npm run install:all
`

### 4. Configure Environment Variables
Create a .env file in the ackend/ directory:
`env
PORT=5001
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/ambulance-system
JWT_SECRET=your_super_secret_jwt_key_here
CLIENT_URL=http://localhost:5173,http://localhost:5001
`

### 5. Seed Initial Data (Drivers & Fleet)
`ash
cd backend
node scripts/seed-all-data.js
cd ..
`

### 6. Run the Application
`ash
# Run both backend and frontend concurrently
npm start
`
- Frontend dev server: http://localhost:5173
- Backend API server: http://localhost:5001

---

## 📦 Project Directory Structure

`
.
├── backend/
│   ├── middleware/        # JWT Authentication & authorization middleware
│   ├── models/            # Mongoose Schemas (User, Ambulance, Booking)
│   ├── routes/            # REST API endpoints (auth, booking, driver, hospital, location, admin)
│   ├── scripts/           # Database seeding and migration utilities
│   ├── utils/             # In-memory location cache, SMS, and Email helpers
│   ├── package.json       # Backend dependencies and scripts
│   └── server.js          # Express app entrypoint & Socket.IO telemetry server
├── frontend/
│   ├── js/                # Client logic (API, tracking, maps, auth, chatbot)
│   ├── styles/            # Modular stylesheets (main, entry, dashboard, provider, admin)
│   ├── entry.html         # Main entry portal & One-Tap Emergency SOS
│   ├── patient-booking.html # Live booking & Leaflet GPS tracking interface
│   ├── provider-login.html# Multi-role authentication (Driver, Hospital, Admin)
│   ├── driver-dashboard.html # Driver navigation & trip status management
│   ├── hospital-dashboard.html # Hospital triage & bed capacity monitor
│   ├── admin-dashboard.html # Central admin oversight & provider verification
│   ├── vite.config.js     # Multi-page build configuration
│   └── package.json       # Frontend dev dependencies
├── package.json           # Root orchestration build & run scripts
├── render.yaml            # Render Cloud Blueprint specification
└── README.md              # Project documentation
`

---

## 📡 Key API Routes

### Authentication
- POST /api/auth/login - User/Driver/Hospital/Admin login (returns JWT)
- POST /api/auth/register/driver - Register new ambulance driver
- POST /api/auth/register/hospital - Register hospital facility

### Bookings & Emergency
- POST /api/booking/create - Create new emergency booking request
- GET /api/booking/status/:id - Fetch live status and assigned driver details
- PATCH /api/booking/:id/status - Update trip state (Accepted, En Route, Completed)

### Locations & Routing
- GET /api/location/all-ambulances - Fetch active on-duty fleet locations
- GET /api/location/all-hospitals - Fetch nearby hospital locations and bed capacity
- GET /api/route - Proxy route coordinates via OSRM to prevent CORS/mixed-content

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author & Contributions
Developed by **Marten Jothi Victor** ([@Martin0610](https://github.com/Martin0610)).
Contributions, issues, and feature requests are welcome!
