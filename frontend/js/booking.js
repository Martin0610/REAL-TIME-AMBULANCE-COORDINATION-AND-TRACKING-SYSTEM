// Booking service - supports backend + demo mode
const BookingService = {
    currentBooking: null,
    ambulanceMarker: null,
    ambulanceMoveTimer: null,
    ambulancePosition: null,
    targetPosition: null,
    movementSpeed: 0.0001, // Degrees per update (simulates ~40 km/h)
    updateInterval: 2000, // Update every 2 seconds
    eta: null,
    etaTimer: null,

    demoAmbulances: [
        { id: 'AMB-01', lat: 13.090, lng: 80.270, driver: { name: 'Ravi Kumar', phone: '9876543210' } },
        { id: 'AMB-02', lat: 13.076, lng: 80.260, driver: { name: 'Suresh N', phone: '9123456780' } },
        { id: 'AMB-03', lat: 13.085, lng: 80.290, driver: { name: 'Priya S', phone: '9000000001' } }
    ],

    demoHospitals: [
        { id: 'HSP-01', name: 'City Care Hospital', lat: 13.060, lng: 80.240, email: 'emergency@citycare.example' },
        { id: 'HSP-02', name: 'Metro Life Hospital', lat: 13.100, lng: 80.280, email: 'er@metrolife.example' },
        { id: 'HSP-03', name: 'Sunrise Medical Center', lat: 13.120, lng: 80.300, email: 'alerts@sunrise.example' }
    ],

    hospitals: [], // Real hospitals from backend
    hospitalMarkers: [], // Store hospital markers

    async loadHospitals() {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/booking/hospitals`);
            if (!response.ok) throw new Error('Failed to load hospitals');
            
            const data = await response.json();
            this.hospitals = data.hospitals || [];
            
            console.log(`✓ Loaded ${this.hospitals.length} hospitals from backend`);
            return this.hospitals;
        } catch (error) {
            console.error('Load hospitals error:', error);
            return [];
        }
    },

    displayHospitalsOnMap(mapId = 'location-map') {
        console.log('📍 displayHospitalsOnMap called');
        console.log('  Map ID:', mapId);
        console.log('  Demo Mode:', CONFIG.DEMO_MODE);
        console.log('  Hospitals count:', this.hospitals.length);
        console.log('  Demo hospitals count:', this.demoHospitals.length);
        
        // Clear existing hospital markers
        this.hospitalMarkers.forEach(marker => {
            if (marker && marker.remove) {
                marker.remove();
            }
        });
        this.hospitalMarkers = [];
        
        // Use demo hospitals if no real hospitals loaded OR if demo mode
        const hospitalsToShow = (CONFIG.DEMO_MODE || this.hospitals.length === 0) 
            ? this.demoHospitals 
            : this.hospitals;
        
        console.log(`  Using ${hospitalsToShow.length} hospitals (${CONFIG.DEMO_MODE || this.hospitals.length === 0 ? 'demo' : 'real'})`);
        
        if (hospitalsToShow.length === 0) {
            console.error('❌ No hospitals to display!');
            return;
        }
        
        // Check if map exists
        if (!LocationService.map) {
            console.error('❌ LocationService.map not found!');
            return;
        }
        
        console.log('✓ Map found, adding markers...');
        
        hospitalsToShow.forEach((hospital, index) => {
            const lat = hospital.lat || hospital.location?.latitude;
            const lng = hospital.lng || hospital.location?.longitude;
            const name = hospital.name || hospital.hospitalName;
            
            console.log(`  [${index + 1}] ${name}:`, { lat, lng });
            
            if (lat && lng) {
                try {
                    const marker = MapService.addHospitalMarker(mapId, hospital.id || hospital._id || `hospital-${index}`, lat, lng, {
                        name: name,
                        address: hospital.address || hospital.hospitalAddress,
                        capacity: hospital.capacity,
                        specialties: hospital.specialties
                    });
                    
                    if (marker) {
                        this.hospitalMarkers.push(marker);
                        console.log(`    ✓ Marker added successfully`);
                    } else {
                        console.error(`    ❌ Marker creation failed`);
                    }
                } catch (error) {
                    console.error(`    ❌ Error adding marker:`, error);
                }
            } else {
                console.warn(`    ⚠️ Missing coordinates`);
            }
        });
        
        console.log(`✅ Total markers added: ${this.hospitalMarkers.length}`);
    },

    // Display available ambulances on map
    displayAmbulancesOnMap(mapId = 'location-map') {
        console.log('🚑 displayAmbulancesOnMap called');
        console.log('  Map ID:', mapId);
        console.log('  Demo Mode:', CONFIG.DEMO_MODE);
        
        if (!LocationService.map) {
            console.error('❌ LocationService.map not found!');
            return;
        }
        
        if (CONFIG.DEMO_MODE || this.hospitals.length === 0) {
            console.log('  Using demo ambulances:', this.demoAmbulances.length);
            
            // Show demo ambulances
            this.demoAmbulances.forEach((ambulance, index) => {
                console.log(`  [${index + 1}] ${ambulance.id}:`, { lat: ambulance.lat, lng: ambulance.lng });
                
                try {
                    const marker = MapService.addAmbulanceMarker(mapId, ambulance.id, ambulance.lat, ambulance.lng, {
                        vehicleNumber: ambulance.id,
                        type: 'emergency',
                        status: 'available',
                        driver: ambulance.driver.name,
                        useEmoji: true
                    });
                    
                    if (marker) {
                        console.log(`    ✓ Ambulance marker added`);
                    } else {
                        console.error(`    ❌ Ambulance marker creation failed`);
                    }
                } catch (error) {
                    console.error(`    ❌ Error adding ambulance marker:`, error);
                }
            });
        }
    },

    async init() {
        this.setupBookingForm();
        this.setupDriverConsole();
        this.setupReportModal();
        this.restoreDemoBooking();
        
        console.log('🚀 BookingService initializing...');
        console.log('Demo Mode:', CONFIG.DEMO_MODE);
        
        // Load hospitals from backend
        if (!CONFIG.DEMO_MODE) {
            console.log('Loading hospitals from backend...');
            await this.loadHospitals();
            console.log(`Hospitals loaded: ${this.hospitals.length}`);
        } else {
            console.log('Demo mode - using demo hospitals');
        }
        
        // Wait for map to be ready and display markers
        const waitForMap = setInterval(() => {
            if (LocationService.map) {
                clearInterval(waitForMap);
                console.log('✓ Map is ready, displaying markers...');
                
                // Display hospitals
                this.displayHospitalsOnMap('location-map');
                
                // Display ambulances (demo mode)
                if (CONFIG.DEMO_MODE) {
                    this.displayAmbulancesOnMap('location-map');
                }
            }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(waitForMap);
            if (!LocationService.map) {
                console.error('❌ Map failed to initialize');
            }
        }, 5000);
    },

    setupBookingForm() {
        const form = document.getElementById('booking-form');
        if (!form) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleBookingSubmit();
        });
    },

    setupDriverConsole() {
        const openBtn = document.getElementById('open-driver-report');
        if (openBtn) {
            openBtn.addEventListener('click', () => this.openReportModal());
        }
    },

    setupReportModal() {
        const submitBtn = document.getElementById('submit-driver-report');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.handleDriverReportSubmit());
        }
    },

    restoreDemoBooking() {
        if (!CONFIG.DEMO_MODE) return;
        const stored = Utils.storage.get('demoBooking');
        if (stored) {
            this.currentBooking = stored;
            this.updateAssignedAmbulanceCard(stored);
            this.updateDriverTripCard(stored);
        }
    },

    async handleBookingSubmit() {
        Utils.showLoading();

        const formData = this.collectFormData();
        const validation = this.validateBookingData(formData);
        if (!validation.isValid) {
            Utils.hideLoading();
            Utils.showError('Please correct the following:', validation.errors.join('<br>'));
            return;
        }

        if (CONFIG.DEMO_MODE) {
            this.createDemoBooking(formData);
            return;
        }

        try {
            if (!LocationService.currentPosition) {
                await LocationService.getCurrentLocation();
            }

            if (!LocationService.currentPosition) {
                Utils.hideLoading();
                Utils.showError('Location is required. Please allow location access or enter address manually.');
                return;
            }

            const bookingPayload = {
                callerType: formData.callerType,
                patientCount: formData.patientCount,
                incidentType: formData.incidentType,
                location: {
                    pickup: {
                        latitude: LocationService.currentPosition.latitude,
                        longitude: LocationService.currentPosition.longitude,
                        address: formData.pickupAddress
                    }
                }
            };

            const response = await API.booking.create(bookingPayload);
            const bookingId = response.bookingId || response.booking?.bookingId;

            this.currentBooking = {
                bookingId,
                status: response.status || 'pending',
                callerType: formData.callerType,
                patientCount: formData.patientCount,
                incidentType: formData.incidentType,
                pickup: {
                    latitude: LocationService.currentPosition.latitude,
                    longitude: LocationService.currentPosition.longitude,
                    address: formData.pickupAddress
                },
                criticalness: 'unknown'
            };

            this.updateAssignedAmbulanceCardBackend(this.currentBooking);
            this.updateDriverTripCard(this.currentBooking);

            Utils.hideLoading();
            Utils.showSuccess('Booking Created', `
                <div class="booking-success">
                    <h4>Booking ID: ${bookingId}</h4>
                    <p>Your request was sent. The nearest ambulance will be assigned.</p>
                    <div style="margin-top: 10px;">
                        <button onclick="BookingService.trackBooking('${bookingId}')" class="btn btn-primary">Track Now</button>
                    </div>
                </div>
            `);
        } catch (err) {
            Utils.hideLoading();
            console.error('Booking create failed:', err);
            Utils.showError('Booking failed', err.message || 'Unable to create booking');
        }
    },

    collectFormData() {
        return {
            callerType: document.querySelector('input[name="callerType"]:checked')?.value || 'patient',
            patientCount: parseInt(document.getElementById('patient-count')?.value || '1', 10),
            incidentType: document.getElementById('incident-type')?.value || 'medical',
            pickupAddress: document.getElementById('pickup-address')?.value?.trim() || ''
        };
    },

    validateBookingData(data) {
        const errors = [];
        if (!data.patientCount || data.patientCount < 1) {
            errors.push('Please enter a valid patient count.');
        }
        if (!data.incidentType) {
            errors.push('Please select the type of incident.');
        }
        if (!data.pickupAddress || data.pickupAddress.length < 5) {
            errors.push('Pickup address is required.');
        }
        return { isValid: errors.length === 0, errors };
    },

    getPickupCoords() {
        if (LocationService.currentPosition) {
            return LocationService.currentPosition;
        }
        if (LocationService.map) {
            const center = LocationService.map.getCenter();
            return { latitude: center.lat, longitude: center.lng };
        }
        return { latitude: CONFIG.DEFAULT_LOCATION.lat, longitude: CONFIG.DEFAULT_LOCATION.lng };
    },

    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    // Calculate realistic ETA based on distance
    calculateETA(distanceKm) {
        // Average ambulance speed in city: 40 km/h
        const avgSpeed = 40;
        const timeInHours = distanceKm / avgSpeed;
        const timeInMinutes = Math.ceil(timeInHours * 60);
        
        // Add buffer time for traffic (10-20%)
        const bufferTime = Math.ceil(timeInMinutes * 0.15);
        return timeInMinutes + bufferTime;
    },

    // Fetch road route from OSRM and animate along it
    async startAmbulanceMovement(startLat, startLng, targetLat, targetLng) {
        this.ambulancePosition = { lat: startLat, lng: startLng };
        this.targetPosition = { lat: targetLat, lng: targetLng };

        const distance = this.haversineDistance(startLat, startLng, targetLat, targetLng);
        this.eta = this.calculateETA(distance);
        this.updateETADisplay();

        if (this.ambulanceMoveTimer) clearInterval(this.ambulanceMoveTimer);
        if (this.etaTimer) clearInterval(this.etaTimer);

        // Fetch road route from OSRM (retry once on failure)
        let routeCoords = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const url = `http://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${targetLng},${targetLat}?overview=full&geometries=geojson`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.routes && data.routes[0]) {
                    routeCoords = data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
                    break;
                }
            } catch(e) {
                console.warn(`OSRM attempt ${attempt + 1} failed:`, e.message);
                if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Draw road route line on map
        if (routeCoords && LocationService.map) {
            if (this._routeLine) LocationService.map.removeLayer(this._routeLine);
            this._routeLine = L.polyline(routeCoords.map(c => [c.lat, c.lng]), {
                color: '#dc2626', weight: 5, opacity: 0.85
            }).addTo(LocationService.map);
        }

        if (routeCoords && routeCoords.length > 1) {
            // Animate along road waypoints
            let stepIndex = 0;
            this.ambulanceMoveTimer = setInterval(() => {
                if (stepIndex >= routeCoords.length) {
                    clearInterval(this.ambulanceMoveTimer);
                    this.ambulanceArrived();
                    return;
                }
                const { lat, lng } = routeCoords[stepIndex];
                this.ambulancePosition = { lat, lng };
                MapService.updateMarker('map', 'assigned-ambulance', lat, lng);
                this.adjustMapViewForMovement();
                const rem = this.haversineDistance(lat, lng, targetLat, targetLng);
                this.eta = this.calculateETA(rem);
                this.updateETADisplay();
                stepIndex++;
            }, 300);
        } else {
            // Fallback: straight line step movement
            this.ambulanceMoveTimer = setInterval(() => {
                this.moveAmbulanceStep();
            }, this.updateInterval);
        }

        this.etaTimer = setInterval(() => { this.updateETACountdown(); }, 60000);
    },

    // Move ambulance one step towards target (straight line fallback)
    moveAmbulanceStep() {
        if (!this.ambulancePosition || !this.targetPosition) return;

        const currentLat = this.ambulancePosition.lat;
        const currentLng = this.ambulancePosition.lng;
        const targetLat = this.targetPosition.lat;
        const targetLng = this.targetPosition.lng;

        const remainingDistance = this.haversineDistance(currentLat, currentLng, targetLat, targetLng);
        if (remainingDistance < 0.05) { this.ambulanceArrived(); return; }

        const latDiff = targetLat - currentLat;
        const lngDiff = targetLng - currentLng;
        const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
        const stepLat = (latDiff / distance) * this.movementSpeed;
        const stepLng = (lngDiff / distance) * this.movementSpeed;

        this.ambulancePosition.lat += stepLat;
        this.ambulancePosition.lng += stepLng;

        if (LocationService.map) {
            MapService.updateMarker('map', 'assigned-ambulance', this.ambulancePosition.lat, this.ambulancePosition.lng);
            this.adjustMapViewForMovement();
        }

        const newDistance = this.haversineDistance(this.ambulancePosition.lat, this.ambulancePosition.lng, targetLat, targetLng);
        this.eta = this.calculateETA(newDistance);
        this.updateETADisplay();
    },

    // Adjust map view to show ambulance and target
    adjustMapViewForMovement() {
        if (!LocationService.map || !this.ambulancePosition || !this.targetPosition) return;
        
        // Only adjust map every 5 updates to reduce jitter
        if (!this.mapUpdateCounter) this.mapUpdateCounter = 0;
        this.mapUpdateCounter++;
        
        if (this.mapUpdateCounter % 5 !== 0) return;
        
        const bounds = L.latLngBounds([
            [this.ambulancePosition.lat, this.ambulancePosition.lng],
            [this.targetPosition.lat, this.targetPosition.lng]
        ]);
        
        // Include hospital if transporting
        if (this.currentBooking?.hospital) {
            bounds.extend([this.currentBooking.hospital.lat, this.currentBooking.hospital.lng]);
        }
        
        // Check if current view already contains these bounds
        const currentBounds = LocationService.map.getBounds();
        const needsUpdate = !currentBounds.contains(bounds);
        
        if (needsUpdate) {
            LocationService.map.fitBounds(bounds, {
                padding: [60, 60],
                maxZoom: 14,
                animate: true,
                duration: 1
            });
        }
    },

    // Update ETA display
    updateETADisplay() {
        const etaElement = document.getElementById('ambulance-eta');
        if (etaElement && this.eta) {
            etaElement.textContent = `${this.eta} min`;
            
            // Update color based on urgency
            if (this.eta <= 5) {
                etaElement.style.color = '#22c55e'; // Green - arriving soon
            } else if (this.eta <= 10) {
                etaElement.style.color = '#fbbf24'; // Yellow - moderate
            } else {
                etaElement.style.color = '#dc2626'; // Red - longer wait
            }
        }
        
        // Update progress message
        const statusElement = document.getElementById('ambulance-status-text');
        if (statusElement) {
            if (this.eta <= 2) {
                statusElement.textContent = 'Ambulance arriving very soon!';
            } else if (this.eta <= 5) {
                statusElement.textContent = 'Ambulance is nearby';
            } else if (this.eta <= 10) {
                statusElement.textContent = 'Ambulance is on the way';
            } else {
                statusElement.textContent = 'Ambulance dispatched';
            }
        }
    },

    // Update ETA countdown (called every minute)
    updateETACountdown() {
        if (this.eta > 0) {
            this.eta--;
            this.updateETADisplay();
        }
    },

    // Ambulance arrived at patient location
    ambulanceArrived() {
        console.log('🚑 Ambulance arrived at patient location!');
        
        // Stop movement
        if (this.ambulanceMoveTimer) {
            clearInterval(this.ambulanceMoveTimer);
            this.ambulanceMoveTimer = null;
        }
        
        if (this.etaTimer) {
            clearInterval(this.etaTimer);
            this.etaTimer = null;
        }
        
        // Update UI
        const etaElement = document.getElementById('ambulance-eta');
        if (etaElement) {
            etaElement.textContent = 'Arrived!';
            etaElement.style.color = '#22c55e';
        }
        
        const statusElement = document.getElementById('ambulance-status-text');
        if (statusElement) {
            statusElement.textContent = '✓ Ambulance has arrived at your location';
        }
        
        // Show notification
        Utils.showToast('Ambulance has arrived at your location!', 'success');
        
        // Update booking status
        if (this.currentBooking) {
            this.currentBooking.status = 'arrived';
            Utils.storage.set('demoBooking', this.currentBooking);
        }
    },

    findNearestAmbulance(lat, lng) {
        let best = null;
        let minDistance = Infinity;
        this.demoAmbulances.forEach((ambulance) => {
            const distance = this.haversineDistance(lat, lng, ambulance.lat, ambulance.lng);
            if (distance < minDistance) {
                minDistance = distance;
                best = ambulance;
            }
        });
        return { ambulance: best, distanceKm: minDistance };
    },

    findNearestHospital(lat, lng) {
        let best = null;
        let minDistance = Infinity;
        this.demoHospitals.forEach((hospital) => {
            const distance = this.haversineDistance(lat, lng, hospital.lat, hospital.lng);
            if (distance < minDistance) {
                minDistance = distance;
                best = hospital;
            }
        });
        return { hospital: best, distanceKm: minDistance };
    },

    createDemoBooking(formData) {
        const pickup = this.getPickupCoords();
        const nearestAmbulance = this.findNearestAmbulance(pickup.latitude, pickup.longitude);
        const nearestHospital = this.findNearestHospital(pickup.latitude, pickup.longitude);

        const bookingId = `DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const booking = {
            bookingId,
            status: 'assigned',
            callerType: formData.callerType,
            patientCount: formData.patientCount,
            incidentType: formData.incidentType,
            pickup: {
                latitude: pickup.latitude,
                longitude: pickup.longitude,
                address: formData.pickupAddress
            },
            ambulance: nearestAmbulance.ambulance,
            hospital: nearestHospital.hospital,
            distanceKm: nearestAmbulance.distanceKm,
            criticalness: 'unknown'
        };

        this.currentBooking = booking;
        Utils.storage.set('demoBooking', booking);

        this.updateAssignedAmbulanceCard(booking);
        this.updateDriverTripCard(booking);
        this.animateAmbulanceToPickup(booking);

        Utils.hideLoading();
        Utils.showSuccess('Booking Created (Demo)', `
            <div class="booking-success">
                <h4>Booking ID: ${bookingId}</h4>
                <p>Nearest ambulance assigned. Use Track to view live status.</p>
                <div style="margin-top: 10px;">
                    <button onclick="BookingService.trackBooking('${bookingId}')" class="btn btn-primary">Track Now</button>
                </div>
            </div>
        `);

        const assigned = document.getElementById('assigned-ambulance-content');
        if (assigned) {
            assigned.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    updateAssignedAmbulanceCard(booking) {
        const assignedEl = document.getElementById('assigned-ambulance-content');
        if (!assignedEl) return;

        assignedEl.innerHTML = `
            <div class="driver-name">${booking.ambulance.id} - Driver: ${booking.ambulance.driver.name}</div>
            <div class="info-item">Phone: ${booking.ambulance.driver.phone}</div>
            <div class="info-item eta-display">
                <strong>ETA:</strong> <span id="ambulance-eta" style="font-size: 1.2rem; font-weight: 700;">Calculating...</span>
            </div>
            <div class="info-item">
                <span id="ambulance-status-text" style="color: #64748b;">Ambulance dispatched</span>
            </div>
            <div class="info-item small">Incident: ${booking.incidentType}</div>
            <div class="info-item small">Patient count: ${booking.patientCount}</div>
            <div style="margin-top: 10px;">
                <button id="btn-picked" class="btn btn-secondary">Mark Picked Up</button>
            </div>
        `;

        const pickupBtn = document.getElementById('btn-picked');
        if (pickupBtn) {
            pickupBtn.addEventListener('click', () => {
                this.currentBooking.status = 'transporting';
                Utils.storage.set('demoBooking', this.currentBooking);
                Utils.showToast('Patient picked up. Add injury report for hospital.', 'success');
                this.updateDriverTripCard(this.currentBooking);
                this.openReportModal();
            });
        }
        
        // Start ambulance movement animation
        if (booking.ambulance && booking.pickup) {
            const ambulanceLat = booking.ambulance.lat;
            const ambulanceLng = booking.ambulance.lng;
            const patientLat = booking.pickup.latitude;
            const patientLng = booking.pickup.longitude;
            
            this.startAmbulanceMovement(ambulanceLat, ambulanceLng, patientLat, patientLng);
        }
    },

    updateAssignedAmbulanceCardBackend(booking) {
        const assignedEl = document.getElementById('assigned-ambulance-content');
        if (!assignedEl) return;

        assignedEl.innerHTML = `
            <div class="driver-name">Booking ${booking.bookingId}</div>
            <div class="info-item">Status: ${booking.status || 'pending'}</div>
            <div class="info-item small">Incident: ${booking.incidentType}</div>
            <div class="info-item small">Patient count: ${booking.patientCount}</div>
            <div class="info-item small">Awaiting ambulance assignment...</div>
            <div style="margin-top: 10px;">
                <button id="btn-picked" class="btn btn-secondary">Mark Picked Up</button>
            </div>
        `;

        const pickupBtn = document.getElementById('btn-picked');
        if (pickupBtn) {
            pickupBtn.addEventListener('click', () => {
                this.currentBooking.status = 'transporting';
                Utils.showToast('Patient picked up. Add injury report for hospital.', 'success');
                this.updateDriverTripCard(this.currentBooking);
                this.openReportModal();
            });
        }
    },

    updateDriverTripCard(booking) {
        const driverTrip = document.getElementById('driver-trip');
        if (!driverTrip) return;

        driverTrip.innerHTML = `
            <p><strong>Booking:</strong> ${booking.bookingId}</p>
            <p><strong>Status:</strong> ${booking.status}</p>
            <p><strong>Pickup:</strong> ${booking.pickup?.address || booking.location?.pickup?.address || 'Unknown'}</p>
            <p><strong>Incident:</strong> ${booking.incidentType || 'medical'}</p>
        `;
    },

    animateAmbulanceToPickup(booking) {
        if (!LocationService.map) return;

        const map = LocationService.map;
        const start = [booking.ambulance.lat, booking.ambulance.lng];
        const end = [booking.pickup.latitude, booking.pickup.longitude];

        // Remove old marker if exists
        if (this.ambulanceMarker) {
            map.removeLayer(this.ambulanceMarker);
        }

        // Add ambulance marker at starting position
        MapService.addAmbulanceMarker('map', 'assigned-ambulance', 
            booking.ambulance.lat, 
            booking.ambulance.lng,
            {
                vehicleNumber: booking.ambulance.id,
                type: 'emergency',
                status: 'en-route',
                driver: booking.ambulance.driver.name,
                useEmoji: true
            }
        );

        // Center map to show both patient and ambulance
        map.setView(end, 13);
        
        // The actual movement is handled by startAmbulanceMovement() 
        // which is called from updateAssignedAmbulanceCard()
    },

    openReportModal() {
        const modal = document.getElementById('driver-report-modal');
        if (modal) modal.style.display = 'flex';
    },

    async handleDriverReportSubmit() {
        if (!this.currentBooking) {
            Utils.showError('No active booking', 'Create a booking first to submit a report.');
            return;
        }

        const criticalness = document.getElementById('report-criticalness')?.value || 'critical';
        const injuryDetails = document.getElementById('report-injury')?.value?.trim();
        const notes = document.getElementById('report-notes')?.value?.trim();

        if (!injuryDetails || injuryDetails.length < 5) {
            Utils.showError('Please add injury details (min 5 characters).');
            return;
        }

        if (CONFIG.DEMO_MODE) {
            this.currentBooking.criticalness = criticalness;
            this.currentBooking.status = 'transporting';
            Utils.storage.set('demoBooking', this.currentBooking);

            const message = `Ambulance ${this.currentBooking.ambulance.id} en route with ${this.currentBooking.patientCount} patient(s). Criticalness: ${criticalness}.`;
            this.pushHospitalNotification(this.currentBooking.hospital, `${message} Injury: ${injuryDetails}`);
            Utils.showToast('Hospital notified (demo).', 'success');
            this.updateDriverTripCard(this.currentBooking);
            Utils.closeModal('driver-report-modal');
            return;
        }

        try {
            Utils.showLoading();
            await API.booking.submitDriverReport(this.currentBooking.bookingId, {
                criticalness,
                injuryDetails,
                notes
            });
            Utils.hideLoading();

            this.currentBooking.criticalness = criticalness;
            this.currentBooking.status = 'transporting';
            this.updateDriverTripCard(this.currentBooking);
            const statusEl = document.getElementById('driver-report-status');
            if (statusEl) {
                statusEl.textContent = 'Report sent to hospital.';
            }

            Utils.showToast('Hospital notified.', 'success');
            Utils.closeModal('driver-report-modal');
        } catch (error) {
            Utils.hideLoading();
            console.error('Driver report failed:', error);
            Utils.showError('Failed to send report', error.message || 'Try again');
        }
    },

    pushHospitalNotification(hospital, body) {
        const container = document.getElementById('hospital-notifications');
        if (!container) return;

        if (container.querySelector('.notification') && container.textContent.includes('No alerts yet')) {
            container.innerHTML = '';
        }

        const div = document.createElement('div');
        div.className = 'notification';
        div.innerHTML = `
            <strong>Email sent to ${hospital.name}</strong>
            <p>${body}</p>
            <p class="muted">To: ${hospital.email}</p>
        `;
        container.prepend(div);
    },

    async trackBooking(bookingId) {
        if (!bookingId) {
            bookingId = document.getElementById('booking-id')?.value?.trim();
        }

        if (!bookingId) {
            Utils.showError('Please enter a booking ID.');
            return;
        }

        if (CONFIG.DEMO_MODE) {
            const booking = Utils.storage.get('demoBooking');
            if (!booking || booking.bookingId !== bookingId) {
                Utils.showError('Booking not found', 'This demo only tracks the latest demo booking.');
                return;
            }
            showSection('track');
            this.displayTrackingInfo(booking);
            return;
        }

        try {
            Utils.showLoading();
            const response = await API.booking.getById(bookingId);
            Utils.hideLoading();
            showSection('track');
            this.displayTrackingInfoBackend(response.booking);
        } catch (error) {
            Utils.hideLoading();
            Utils.showError('Unable to track booking', 'Please check the booking ID and try again.');
        }
    },

    displayTrackingInfo(booking) {
        const trackingResult = document.getElementById('tracking-result');
        if (!trackingResult) return;

        trackingResult.innerHTML = `
            <div class="info-card">
                <h3>Booking ${booking.bookingId}</h3>
                <p><strong>Status:</strong> ${booking.status}</p>
                <p><strong>Pickup:</strong> ${booking.pickup.address}</p>
                <p><strong>Incident:</strong> ${booking.incidentType}</p>
                <p><strong>Ambulance:</strong> ${booking.ambulance.id} (Driver: ${booking.ambulance.driver.name})</p>
                <p><strong>Criticalness:</strong> ${booking.criticalness}</p>
            </div>
        `;
        trackingResult.style.display = 'block';
    },

    displayTrackingInfoBackend(booking) {
        const trackingResult = document.getElementById('tracking-result');
        if (!trackingResult) return;

        trackingResult.innerHTML = `
            <div class="info-card">
                <h3>Booking ${booking.bookingId}</h3>
                <p><strong>Status:</strong> ${booking.status}</p>
                <p><strong>Pickup:</strong> ${booking.location?.pickup?.address || 'Unknown'}</p>
                <p><strong>Incident:</strong> ${booking.incidentType || 'medical'}</p>
                <p><strong>Patients:</strong> ${booking.patientCount || 1}</p>
                <p><strong>Criticalness:</strong> ${booking.driverReport?.criticalness || 'unknown'}</p>
                ${booking.driverReport?.injuryDetails ? `<p><strong>Injury:</strong> ${booking.driverReport.injuryDetails}</p>` : ''}
            </div>
        `;
        trackingResult.style.display = 'block';
        
        // Initialize map view for tracking
        const mapContainer = document.getElementById('tracking-map');
        if (mapContainer) {
            mapContainer.style.display = 'block';
            // Create map
            const map = MapService.createMap('tracking-map', { center: [booking.location.pickup.latitude, booking.location.pickup.longitude], zoom: 14 });

            // Add patient marker
            MapService.addPatientMarker('tracking-map', booking.location.pickup.latitude, booking.location.pickup.longitude, { severity: booking.emergencyDetails?.severity || 3, address: booking.location.pickup.address });

            // Add ambulance marker at pickup (initially hidden until updates)
            MapService.addAmbulanceMarker('tracking-map', booking.bookingId, booking.location.pickup.latitude, booking.location.pickup.longitude, { useEmoji: true });

            // Join socket room and start listening
            if (!CONFIG.DEMO_MODE) {
                TrackingService.joinBookingRoom(booking.bookingId);
                // Request server to start simulation (demo-friendly) - ignore errors
                try { API.booking.simulate(booking.bookingId).catch(()=>{}); } catch(e) {}
            }
        }
    },

    // Handle incoming ambulance location (from socket)
    onAmbulanceLocation(data) {
        // data: { bookingId, latitude, longitude, phase }
        const mapId = 'tracking-map';
        if (!MapService.getMap(mapId)) return;

        // Update or add ambulance marker
        const markerId = `ambulance-${data.bookingId}`;
        const updated = MapService.updateMarker(mapId, markerId, data.latitude, data.longitude);
        if (!updated) {
            MapService.addAmbulanceMarker(mapId, data.bookingId, data.latitude, data.longitude, { useEmoji: true });
        }

        // Center map to ambulance
        MapService.centerMap(mapId, data.latitude, data.longitude);
    },

    onTrafficUpdate(data) {
        // data: { location: {latitude, longitude}, state }
        const mapId = 'tracking-map';
        if (!MapService.getMap(mapId)) return;
        const id = `traffic-${Date.now()}`;
        const color = data.state === 'red' ? '#ef4444' : data.state === 'yellow' ? '#f59e0b' : '#10b981';
        MapService.addMarker(mapId, id, data.location.latitude, data.location.longitude, { icon: 'map-pin', color });
    },
};
