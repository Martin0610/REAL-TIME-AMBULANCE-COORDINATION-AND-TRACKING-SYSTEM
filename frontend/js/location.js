// Location service for handling GPS and mapping
const LocationService = {
    currentPosition: null,
    watchId: null,
    map: null,
    markers: {},

    init() {
        this.setupLocationButton();
        this.initializeMap();
    },

    setupLocationButton() {
        const getLocationBtn = document.getElementById('get-location');
        if (getLocationBtn) {
            getLocationBtn.addEventListener('click', async () => {
                await this.getCurrentLocation();
            });
        }
    },

    async getCurrentLocation() {
        if (!navigator.geolocation) {
            this.updateLocationStatus('Geolocation is not supported by this browser', 'error');
            return null;
        }

        try {
            this.updateLocationStatus('Getting your location...', 'loading');
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000
                });
            });

            const { latitude, longitude } = position.coords;
            this.currentPosition = { latitude, longitude };

            if (!Utils.isInServiceArea(latitude, longitude)) {
                const nearest = Utils.getNearestServiceArea(latitude, longitude);
                this.updateLocationStatus(
                    `Outside service area. Nearest: ${nearest.area.name} (${Utils.formatDistance(nearest.distance)})`,
                    'warning'
                );
            } else {
                this.updateLocationStatus('Location detected successfully', 'success');
            }

            try {
                const address = await this.reverseGeocode(latitude, longitude);
                const addressField = document.getElementById('pickup-address');
                if (addressField && address) {
                    addressField.value = address;
                }
            } catch (error) {
                console.error('Reverse geocoding failed:', error);
            }

            this.updateMapLocation(latitude, longitude);
            return { latitude, longitude };
        } catch (error) {
            console.error('Geolocation error:', error);
            this.updateLocationStatus('Unable to get your location. Please enter address manually.', 'error');
            return null;
        }
    },

    updateLocationStatus(message, type = 'info') {
        const locationStatus = document.getElementById('location-status');
        if (locationStatus) {
            locationStatus.textContent = message;
            locationStatus.className = `location-status ${type}`;
        }
    },

    initializeMap() {
        const mapContainer = document.getElementById('location-map');
        if (!mapContainer) {
            console.error('❌ Map container not found');
            return;
        }

        if (this.map) {
            this.map.remove();
        }

        console.log('🗺️ Initializing map...');
        this.map = L.map('location-map').setView([12.9249, 80.1000], 12);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(this.map);

        console.log('✓ Map created successfully');

        this.addServiceAreaMarkers();
        
        // Trigger marker display after map is ready
        setTimeout(() => {
            console.log('🎯 Triggering marker display...');
            
            if (CONFIG.DEMO_MODE) {
                console.log('Loading demo entities...');
                this.loadDemoEntities();
            }
            
            // Call BookingService to display hospitals
            if (window.BookingService) {
                console.log('Calling BookingService.displayHospitalsOnMap...');
                BookingService.displayHospitalsOnMap('location-map');
                
                if (CONFIG.DEMO_MODE) {
                    console.log('Calling BookingService.displayAmbulancesOnMap...');
                    BookingService.displayAmbulancesOnMap('location-map');
                }
            }
        }, 300);

        mapContainer.style.height = '400px';
        mapContainer.style.borderRadius = '12px';
        mapContainer.style.overflow = 'hidden';
        
        // Refresh map size
        setTimeout(() => {
            this.map.invalidateSize();
        }, 100);
    },

    loadDemoEntities() {
        if (!this.map) return;

        const bookingService = window.BookingService || {};
        const ambulances = bookingService.demoAmbulances || [];
        ambulances.forEach((amb) => {
            const markerId = `ambulance-${amb.id}`;
            if (this.markers[markerId]) return;

            const marker = L.marker([amb.lat, amb.lng], {
                icon: L.divIcon({
                    className: 'custom-marker',
                    html: '<i class="fas fa-ambulance" style="color:#ef4444; font-size:20px;"></i>',
                    iconSize: [25, 25],
                    iconAnchor: [12, 25]
                })
            }).addTo(this.map).bindPopup(`
                <div class="ambulance-popup">
                    <h4><i class="fas fa-ambulance"></i> ${amb.id}</h4>
                    <p><strong>Driver:</strong> ${amb.driver.name}</p>
                </div>
            `);

            this.markers[markerId] = marker;
        });

        const hospitals = bookingService.demoHospitals || [];
        hospitals.forEach((hsp) => {
            const markerId = `hospital-${hsp.id}`;
            if (this.markers[markerId]) return;

            const marker = L.marker([hsp.lat, hsp.lng], {
                icon: L.divIcon({
                    className: 'custom-marker',
                    html: '<i class="fas fa-hospital" style="color:#0b7a75; font-size:18px;"></i>',
                    iconSize: [24, 24],
                    iconAnchor: [12, 24]
                })
            }).addTo(this.map).bindPopup(`
                <div class="hospital-popup">
                    <h4><i class="fas fa-hospital"></i> ${hsp.name}</h4>
                    <p>${hsp.email}</p>
                </div>
            `);

            this.markers[markerId] = marker;
        });
    },

    addServiceAreaMarkers() {
        if (!this.map) return;

        Object.values(CONFIG.SERVICE_AREAS).forEach((area) => {
            const marker = L.marker([area.lat, area.lng])
                .addTo(this.map)
                .bindPopup(`<b>${area.name}</b><br>Service Area`);
            this.markers[area.name] = marker;
        });
        
        // Fetch and add real hospital markers from backend
        console.log('🏥 Fetching hospitals from backend...');
        this.fetchAndAddHospitals();
        
        // Fetch and add real ambulance markers from backend
        console.log('🚑 Fetching ambulances from backend...');
        this.fetchAndAddAmbulances();
    },
    
    async fetchAndAddHospitals() {
            const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.SOCKET_URL) 
                ? CONFIG.SOCKET_URL 
                : (window.__BACKEND_URL__ 
                    ? window.__BACKEND_URL__.replace(/\/$/, '') 
                    : (((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || /^192\.168\./.test(window.location.hostname)) && window.location.port !== '5001')
                        ? `http://${window.location.hostname}:5001`
                        : window.location.origin));
            const response = await fetch(`${apiBase}/api/location/all-hospitals`);
            if (!response.ok) {
                console.error('Failed to fetch hospitals:', response.statusText);
                // Fallback to hardcoded markers
                this.addHospitalMarkersDirect();
                return;
            }
            
            const data = await response.json();
            console.log(`✓ Fetched ${data.count} hospitals from backend`);
            
            data.hospitals.forEach((hospital, index) => {
                console.log(`  Adding hospital ${index + 1}: ${hospital.name}`);
                
                const icon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="font-size: 24px;">🏥</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 30]
                });
                
                const marker = L.marker([hospital.location.latitude, hospital.location.longitude], { icon })
                    .addTo(this.map)
                    .bindPopup(`
                        <div style="font-family: Arial, sans-serif;">
                            <h4 style="margin: 0 0 8px 0; color: #059669;">
                                <i class="fas fa-hospital"></i> ${hospital.name}
                            </h4>
                            <p style="margin: 4px 0; font-size: 13px;">
                                <strong>Address:</strong> ${hospital.address}
                            </p>
                            <p style="margin: 4px 0; font-size: 13px;">
                                <strong>Capacity:</strong> ${hospital.capacity} beds
                            </p>
                            <p style="margin: 4px 0; font-size: 13px;">
                                <strong>Facilities:</strong> ${hospital.specialties.slice(0, 3).join(', ')}
                            </p>
                            <p style="margin: 4px 0; font-size: 13px;">
                                <strong>Status:</strong> <span style="color: #22c55e;">Available 24/7</span>
                            </p>
                        </div>
                    `);
                
                this.markers[`hospital-${hospital.id}`] = marker;
            });
            
            console.log(`✅ Added ${data.count} hospital markers from backend`);
        } catch (error) {
            console.error('Error fetching hospitals:', error);
            // Fallback to hardcoded markers
            this.addHospitalMarkersDirect();
        }
    },
    
    async fetchAndAddAmbulances() {
        try {
            const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.SOCKET_URL) 
                ? CONFIG.SOCKET_URL 
                : (window.__BACKEND_URL__ 
                    ? window.__BACKEND_URL__.replace(/\/$/, '') 
                    : (((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || /^192\.168\./.test(window.location.hostname)) && window.location.port !== '5001')
                        ? `http://${window.location.hostname}:5001`
                        : window.location.origin));
            const response = await fetch(`${apiBase}/api/location/all-ambulances`);
            if (!response.ok) {
                console.error('Failed to fetch ambulances:', response.statusText);
                // Fallback to hardcoded markers
                this.addAmbulanceMarkersDirect();
                return;
            }
            
            const data = await response.json();
            console.log(`✓ Fetched ${data.count} ambulances from backend`);
            
            data.ambulances.forEach((ambulance, index) => {
                console.log(`  Adding ambulance ${index + 1}: ${ambulance.vehicleNumber} - Driver: ${ambulance.driver.name}`);
                
                const statusColor = ambulance.status === 'available' ? '#22c55e' : '#f59e0b';
                const dutyStatus = ambulance.driver.isOnDuty ? 'On Duty' : 'Off Duty';
                
                const icon = L.divIcon({
                    className: 'custom-marker-emoji',
                    html: `<div style="font-size: 28px;">🚑</div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                });
                
                const marker = L.marker([ambulance.location.latitude, ambulance.location.longitude], { icon })
                    .addTo(this.map)
                    .bindPopup(`
                        <div style="font-family: Arial, sans-serif;">
                            <h4 style="margin: 0 0 8px 0; color: #dc2626;">
                                <i class="fas fa-ambulance"></i> ${ambulance.vehicleNumber}
                            </h4>
                            <p style="margin: 4px 0; font-size: 13px;">
                                <strong>Driver:</strong> ${ambulance.driver.name}
                            </p>
                            <p style="margin: 4px 0; font-size: 13px;">
                                <strong>Type:</strong> ${ambulance.type.charAt(0).toUpperCase() + ambulance.type.slice(1)}
                            </p>
                            <p style="margin: 4px 0; font-size: 13px;">
                                <strong>Status:</strong> <span style="color: ${statusColor};">${ambulance.status.charAt(0).toUpperCase() + ambulance.status.slice(1)}</span>
                            </p>
                            <p style="margin: 4px 0; font-size: 13px;">
                                <strong>Duty:</strong> <span style="color: ${ambulance.driver.isOnDuty ? '#22c55e' : '#6b7280'};">${dutyStatus}</span>
                            </p>
                        </div>
                    `);
                
                this.markers[`ambulance-${ambulance.id}`] = marker;
            });
            
            console.log(`✅ Added ${data.count} ambulance markers from backend`);
        } catch (error) {
            console.error('Error fetching ambulances:', error);
            // Fallback to hardcoded markers
            this.addAmbulanceMarkersDirect();
        }
    },
    
    addHospitalMarkersDirect() {
        // Real hospitals spread across Chennai service areas
        const hospitals = [
            { name: 'Parvathy Hospital', lat: 12.9516, lng: 80.1462, capacity: 200, area: 'Chrompet' },
            { name: 'Hindu Mission Hospital', lat: 12.9249, lng: 80.1000, capacity: 250, area: 'Tambaram' },
            { name: 'Chromepet Govt Hospital', lat: 12.9520, lng: 80.1420, capacity: 300, area: 'Chrompet' },
            { name: 'Sri Ramachandra Medical Centre', lat: 13.0358, lng: 80.1556, capacity: 500, area: 'Porur' },
            { name: 'Medway Hospital', lat: 12.9675, lng: 80.1491, capacity: 150, area: 'Pallavaram' },
            { name: 'Lifeline Hospital', lat: 12.8969, lng: 80.0878, capacity: 180, area: 'Perungalathur' },
            { name: 'Vandalur Medical Centre', lat: 12.8924, lng: 80.0785, capacity: 120, area: 'Vandalur' }
        ];
        
        hospitals.forEach((hospital, index) => {
            console.log(`  Adding hospital ${index + 1}: ${hospital.name} (${hospital.area})`);
            
            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="font-size: 24px;">🏥</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            });
            
            const marker = L.marker([hospital.lat, hospital.lng], { icon })
                .addTo(this.map)
                .bindPopup(`
                    <div style="font-family: Arial, sans-serif;">
                        <h4 style="margin: 0 0 8px 0; color: #059669;">
                            <i class="fas fa-hospital"></i> ${hospital.name}
                        </h4>
                        <p style="margin: 4px 0; font-size: 13px;">
                            <strong>Location:</strong> ${hospital.area}
                        </p>
                        <p style="margin: 4px 0; font-size: 13px;">
                            <strong>Capacity:</strong> ${hospital.capacity} beds
                        </p>
                        <p style="margin: 4px 0; font-size: 13px;">
                            <strong>Status:</strong> <span style="color: #22c55e;">Available 24/7</span>
                        </p>
                    </div>
                `);
            
            console.log(`    ✓ Hospital marker added at [${hospital.lat}, ${hospital.lng}]`);
        });
        
        console.log(`✅ Added ${hospitals.length} hospital markers across Chennai`);
    },
    
    addAmbulanceMarkersDirect() {
        // Ambulances spread across different service areas
        const ambulances = [
            { id: 'AMB-01', lat: 12.8950, lng: 80.0800, driver: 'Ravi Kumar', area: 'Vandalur' },
            { id: 'AMB-02', lat: 12.9280, lng: 80.1020, driver: 'Suresh N', area: 'Tambaram' },
            { id: 'AMB-03', lat: 12.9540, lng: 80.1480, driver: 'Priya S', area: 'Chrompet' },
            { id: 'AMB-04', lat: 12.9690, lng: 80.1510, driver: 'Karthik R', area: 'Pallavaram' },
            { id: 'AMB-05', lat: 12.8990, lng: 80.0900, driver: 'Venkat M', area: 'Perungalathur' },
            { id: 'AMB-06', lat: 12.9200, lng: 80.0950, driver: 'Prakash T', area: 'Tambaram West' },
            { id: 'AMB-07', lat: 12.9480, lng: 80.1400, driver: 'Arun Kumar', area: 'Chrompet East' },
            { id: 'AMB-08', lat: 12.9650, lng: 80.1450, driver: 'Dinesh P', area: 'Pallavaram North' }
        ];
        
        ambulances.forEach((ambulance, index) => {
            console.log(`  Adding ambulance ${index + 1}: ${ambulance.id} (${ambulance.area})`);
            
            const icon = L.divIcon({
                className: 'custom-marker-emoji',
                html: `<div style="font-size: 28px;">🚑</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });
            
            const marker = L.marker([ambulance.lat, ambulance.lng], { icon })
                .addTo(this.map)
                .bindPopup(`
                    <div style="font-family: Arial, sans-serif;">
                        <h4 style="margin: 0 0 8px 0; color: #dc2626;">
                            <i class="fas fa-ambulance"></i> ${ambulance.id}
                        </h4>
                        <p style="margin: 4px 0; font-size: 13px;">
                            <strong>Driver:</strong> ${ambulance.driver}
                        </p>
                        <p style="margin: 4px 0; font-size: 13px;">
                            <strong>Location:</strong> ${ambulance.area}
                        </p>
                        <p style="margin: 4px 0; font-size: 13px;">
                            <strong>Status:</strong> <span style="color: #22c55e;">Available</span>
                        </p>
                    </div>
                `);
            
            console.log(`    ✓ Ambulance marker added at [${ambulance.lat}, ${ambulance.lng}]`);
        });
        
        console.log(`✅ Added ${ambulances.length} ambulance markers across Chennai`);
    },

    updateMapLocation(latitude, longitude) {
        if (!this.map) {
            this.initializeMap();
        }

        if (this.userMarker) {
            this.map.removeLayer(this.userMarker);
        }

        this.userMarker = L.marker([latitude, longitude], {
            icon: L.divIcon({
                className: 'user-location-marker',
                html: '<i class="fas fa-map-marker-alt" style="color:#d7263d; font-size:24px;"></i>',
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            })
        }).addTo(this.map);

        this.userMarker.bindPopup(`
            <div style="text-align: center;">
                <b>Your Location</b><br>
                <small>Lat: ${latitude.toFixed(6)}<br>Lng: ${longitude.toFixed(6)}</small>
            </div>
        `).openPopup();

        this.map.setView([latitude, longitude], 14);

        if (this.accuracyCircle) {
            this.map.removeLayer(this.accuracyCircle);
        }

        this.accuracyCircle = L.circle([latitude, longitude], {
            radius: 100,
            fillColor: '#d7263d',
            fillOpacity: 0.1,
            color: '#d7263d',
            weight: 2
        }).addTo(this.map);
    },

    async reverseGeocode(latitude, longitude) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
            );
            if (!response.ok) throw new Error('Geocoding failed');
            const data = await response.json();
            if (data && data.display_name) {
                return data.display_name;
            }
            const nearest = Utils.getNearestServiceArea(latitude, longitude);
            return `Near ${nearest.area.name}, Chennai, Tamil Nadu, India`;
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            const nearest = Utils.getNearestServiceArea(latitude, longitude);
            return `Near ${nearest.area.name}, Chennai, Tamil Nadu, India`;
        }
    }
};
