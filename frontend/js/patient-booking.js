// Patient Booking and Tracking - Single Page Experience
let currentBooking = null;
let trackingMap = null;
let previewMap = null; // Map shown BEFORE booking
let socket = null;
let userLocation = null;
let ambulanceMarker = null;
let patientMarker = null;
let hospitalMarker = null;
let routeLine = null;
let updateInterval = null;
let nearbyAmbulances = [];
let nearbyHospitals = [];
let nearbyAmbulanceMarkers = []; // Store markers for nearby ambulances
let nearbyHospitalMarkers = []; // Store markers for nearby hospitals
let isBookingStarted = false; // Track if booking has started

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Patient Booking Page Loaded');
    
    // Check if opened with ?track=BOOKING_ID
    const urlParams = new URLSearchParams(window.location.search);
    const trackBookingId = urlParams.get('track');
    
    if (trackBookingId) {
        // Auto-load tracking for this booking
        currentBooking = { bookingId: trackBookingId };
        isBookingStarted = true;
        window.isBookingStarted = true;
        document.getElementById('booking-form-section').style.display = 'none';
        document.getElementById('tracking-section').classList.add('active');
        document.getElementById('display-booking-id').textContent = trackBookingId;
        initializeSocket();

        // Fetch booking to get pickup location before initializing map
        fetch(`${CONFIG.API_BASE_URL}/booking/${trackBookingId}`)
            .then(r => r.json())
            .then(data => {
                const pickup = data.booking?.location?.pickup;
                if (pickup && pickup.latitude) {
                    userLocation = { latitude: pickup.latitude, longitude: pickup.longitude };
                }
                initializeTrackingMap();
                socket.emit('join-room', `booking-${trackBookingId}`);
                startStatusPolling();
            })
            .catch(() => {
                initializeTrackingMap();
                socket.emit('join-room', `booking-${trackBookingId}`);
                startStatusPolling();
            });

        console.log(`✅ Auto-tracking booking: ${trackBookingId}`);
    } else {
        // Normal flow
        initializeLocation();
        initializeSocket();
        setupFormSubmit();
        loadDriverContacts();
    }
    
    console.log('✅ All initialization complete');
});

function initializeLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                window.userLocation = userLocation;
                
                // Reverse geocode to get address
                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.latitude}&lon=${userLocation.longitude}`)
                    .then(res => res.json())
                    .then(data => {
                        document.getElementById('pickup-address').value = data.display_name;
                    })
                    .catch(() => {
                        document.getElementById('pickup-address').value = `${userLocation.latitude}, ${userLocation.longitude}`;
                    });
                
                // Initialize preview map first, then load data
                initializePreviewMap();

                // Load ambulances and hospitals — map is ready now
                await Promise.all([loadNearbyAmbulances(), loadNearbyHospitals()]);
            },
            (error) => {
                alert('Please enable location access to book an ambulance');
                console.error('Location error:', error);
            }
        );
    } else {
        alert('Geolocation is not supported by your browser');
    }
}

// Initialize preview map (BEFORE booking)
function initializePreviewMap() {
    if (!userLocation) return;
    
    previewMap = L.map('preview-map').setView([userLocation.latitude, userLocation.longitude], 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(previewMap);
    
    // Patient marker
    L.marker([userLocation.latitude, userLocation.longitude], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:28px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))">📍</div>', iconSize:[28,28], iconAnchor:[14,28] })
    }).addTo(previewMap).bindPopup('<b>Your Location</b>').openPopup();

    // Force map to render correctly
    setTimeout(() => previewMap.invalidateSize(), 100);
}

// Load nearby ambulances
async function loadNearbyAmbulances() {
    if (!userLocation) return;
    
    try {
        const response = await fetch(
            `${CONFIG.API_BASE_URL}/booking/nearby-ambulances?latitude=${userLocation.latitude}&longitude=${userLocation.longitude}&radius=150&includeBusy=1`
        );
        
        if (response.ok) {
            const data = await response.json();
            nearbyAmbulances = data.ambulances || [];
            console.log(`✓ Found ${nearbyAmbulances.length} nearby ambulances`);
            
            if (previewMap && !isBookingStarted) {
                // Small delay to ensure map tiles are loaded
                setTimeout(() => displayNearbyAmbulancesOnPreview(), 300);
            }
        }
    } catch (error) {
        console.error('Load nearby ambulances error:', error);
    }
}

// Load nearby hospitals
async function loadNearbyHospitals() {
    console.log('🏥 Loading hospitals...');
    
    try {
        let url;
        
        // Try with location first if available
        if (userLocation) {
            url = `${CONFIG.API_BASE_URL}/booking/hospitals?latitude=${userLocation.latitude}&longitude=${userLocation.longitude}&radius=150`;
            console.log('📡 Fetching hospitals near location:', userLocation);
        } else {
            // Fallback: load all hospitals without location filter
            url = `${CONFIG.API_BASE_URL}/booking/hospitals`;
            console.log('📡 Fetching all hospitals (no location available)');
        }
        
        console.log('📡 URL:', url);
        
        const response = await fetch(url);
        
        console.log('📥 Response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            nearbyHospitals = data.hospitals || [];
            console.log(`✓ Found ${nearbyHospitals.length} hospitals`);
            
            // If we have location, sort by distance
            if (userLocation && nearbyHospitals.length > 0) {
                nearbyHospitals.forEach(hospital => {
                    if (hospital.location && !hospital.distance) {
                        hospital.distance = calculateDistance(
                            userLocation.latitude,
                            userLocation.longitude,
                            hospital.location.latitude,
                            hospital.location.longitude
                        );
                    }
                });
                nearbyHospitals.sort((a, b) => (a.distance || 999) - (b.distance || 999));
            }
            
            // Show on preview map — hospitals are ready, now show everything
            if (previewMap && !isBookingStarted) {
                setTimeout(() => {
                    displayNearbyHospitalsOnPreview();
                    // Re-call ambulance display so hospitals appear together
                    if (nearbyAmbulances.length > 0) displayNearbyAmbulancesOnPreview();
                }, 300);
            }
            
            // Display hospital selection dropdown
            displayHospitalSelection();
        } else {
            console.error('❌ Failed to load hospitals:', response.status, response.statusText);
            
            // Try fallback: load without location
            if (userLocation) {
                console.log('🔄 Retrying without location filter...');
                userLocation = null; // Temporarily clear location
                await loadNearbyHospitals(); // Retry
                return;
            }
            
            const container = document.getElementById('hospital-selection');
            if (container) {
                container.innerHTML = '<p style="color: #ef4444;">Failed to load hospitals. Please refresh the page.</p>';
            }
        }
    } catch (error) {
        console.error('❌ Load hospitals error:', error);
        console.error('Error details:', error.message, error.stack);
        
        const container = document.getElementById('hospital-selection');
        if (container) {
            container.innerHTML = `
                <p style="color: #ef4444;">Error loading hospitals: ${error.message}</p>
                <p style="color: #6b7280; font-size: 0.875rem;">Please check that the backend server is running on port 5001</p>
            `;
        }
    }
}

// Display hospital selection dropdown
function displayHospitalSelection() {
    const container = document.getElementById('hospital-selection');
    if (!container) {
        console.warn('⚠️ Hospital selection container not found');
        return;
    }
    
    if (nearbyHospitals.length === 0) {
        container.innerHTML = '<p style="color: #6b7280;">Loading hospitals...</p>';
        return;
    }
    
    console.log(`✓ Displaying ${nearbyHospitals.length} hospitals in dropdown`);
    
    // Create dropdown with nearby hospitals
    const html = `
        <label for="hospital-select" style="display: block; font-weight: 600; margin-bottom: 8px; color: #111827;">
            Select Destination Hospital
        </label>
        <select id="hospital-select" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 1rem; background: white;">
            <option value="">Nearest Hospital (Auto-select)</option>
            ${nearbyHospitals.map(hospital => {
                const distanceText = hospital.distance ? `${hospital.distance.toFixed(1)} km away` : 'Distance unknown';
                return `
                    <option value="${hospital.id}">
                        🏥 ${hospital.name} - ${distanceText}
                    </option>
                `;
            }).join('')}
        </select>
        <p style="font-size: 0.875rem; color: #6b7280; margin-top: 4px;">
            ${nearbyHospitals.length} hospital${nearbyHospitals.length !== 1 ? 's' : ''} available
        </p>
    `;
    
    container.innerHTML = html;
    
    // Add event listener to highlight selected hospital on map
    const select = document.getElementById('hospital-select');
    if (select) {
        select.addEventListener('change', (e) => {
            highlightSelectedHospital(e.target.value);
        });
    }
    
    console.log('✓ Hospital dropdown rendered successfully');
}

// Load driver contact list for patients
async function loadDriverContacts() {
    const container = document.getElementById('driver-contact-list');
    if (!container) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/booking/drivers`);
        if (!response.ok) throw new Error('Unable to load driver contacts');

        const data = await response.json();
        if (!data.success || !Array.isArray(data.drivers)) {
            throw new Error('Invalid driver list response');
        }

        if (data.drivers.length === 0) {
            container.innerHTML = '<p>No drivers available right now. Please refresh later.</p>';
            return;
        }

        container.innerHTML = data.drivers.map(driver => `
            <div style="margin-bottom: 8px; font-size: 0.95rem;">
                <strong>${driver.name}</strong> - ${driver.isOnDuty ? 'On Duty' : 'Off Duty'}<br>
                📱 <a href="tel:${driver.phone}">${driver.phone}</a><br>
                🚑 ${driver.ambulance ? driver.ambulance.vehicleNumber + ' (' + driver.ambulance.status + ')' : 'Unassigned ambulance'}
            </div>
        `).join('');
    } catch (error) {
        console.error('Load driver contacts error:', error);
        container.innerHTML = '<p style="color:#dc2626;">Could not load drivers. Check backend.</p>';
    }
}

// Highlight selected hospital on preview map
function highlightSelectedHospital(hospitalId) {
    if (!previewMap || !hospitalId) return;
    
    const hospital = nearbyHospitals.find(h => h.id === hospitalId);
    if (!hospital || !hospital.location) return;
    
    // Center map on hospital and open popup
    previewMap.setView([hospital.location.latitude, hospital.location.longitude], 14);
    
    // Find and open the hospital marker popup
    previewMap.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            const latLng = layer.getLatLng();
            if (Math.abs(latLng.lat - hospital.location.latitude) < 0.0001 &&
                Math.abs(latLng.lng - hospital.location.longitude) < 0.0001) {
                layer.openPopup();
            }
        }
    });
}

// Display nearby ambulances on PREVIEW map (BEFORE booking)
function displayNearbyAmbulancesOnPreview() {
    if (!previewMap || nearbyAmbulances.length === 0) return;
    
    console.log(`🚑 Adding ${nearbyAmbulances.length} ambulances to map`);

    const allPoints = [[userLocation.latitude, userLocation.longitude]];
    
    nearbyAmbulances.forEach((ambulance) => {
        if (!ambulance.location?.latitude) return;

        const icon = L.divIcon({
            className: '',
            html: `<div style="font-size:32px;filter:drop-shadow(0 2px 6px rgba(220,38,38,0.7));line-height:1;">🚑</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -20]
        });

        const popup = `
            <div style="font-family:Arial;font-size:13px;min-width:180px;">
                <div style="background:#dc2626;color:white;padding:6px 10px;border-radius:4px 4px 0 0;font-weight:bold;margin:-3px -3px 8px -3px;">
                    🚑 ${ambulance.vehicleNumber}
                </div>
                <b>Driver:</b> ${ambulance.driver?.name || 'N/A'}<br>
                <b>Type:</b> ${ambulance.type}<br>
                <b>Distance:</b> <span style="color:#dc2626;font-weight:700;">${ambulance.distance.toFixed(1)} km</span><br>
                <b>Status:</b> <span style="color:#22c55e;">✅ Available</span><br>
                ${ambulance.driver?.phone ? `<b>📱</b> <a href="tel:${ambulance.driver.phone}">${ambulance.driver.phone}</a>` : ''}
            </div>`;

        L.marker([ambulance.location.latitude, ambulance.location.longitude], { icon })
            .addTo(previewMap)
            .bindPopup(popup, { maxWidth: 240 });

        allPoints.push([ambulance.location.latitude, ambulance.location.longitude]);
    });

    // Also add hospital markers
    nearbyHospitals.forEach((hospital) => {
        if (!hospital.location?.latitude) return;
        L.marker([hospital.location.latitude, hospital.location.longitude], {
            icon: L.divIcon({ className: '', html: '<div style="font-size:24px">🏥</div>', iconSize:[24,24], iconAnchor:[12,12] })
        }).addTo(previewMap).bindPopup(`<b>🏥 ${hospital.name}</b><br><small>${hospital.address}</small>`);
        allPoints.push([hospital.location.latitude, hospital.location.longitude]);
    });

    // Fit map to show everything
    if (allPoints.length > 1) {
        previewMap.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40], maxZoom: 12 });
    }

    console.log(`✅ Map updated: ${nearbyAmbulances.length} ambulances + ${nearbyHospitals.length} hospitals`);
}

// Helper function to capitalize ambulance type
function capitalizeType(type) {
    const typeMap = {
        'basic': 'Type A - Basic Transport',
        'advanced': 'Type B - Advanced Life Support',
        'critical': 'Type C - Mobile ICU'
    };
    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

// Display nearby hospitals on PREVIEW map — now handled inside displayNearbyAmbulancesOnPreview
// Kept as stub so existing calls don't break
function displayNearbyHospitalsOnPreview() {
    // hospitals are added inside displayNearbyAmbulancesOnPreview together with ambulances
    // only call standalone if ambulances haven't loaded yet
    if (nearbyAmbulances.length === 0 && previewMap && nearbyHospitals.length > 0) {
        const allPoints = [[userLocation.latitude, userLocation.longitude]];
        nearbyHospitals.forEach((hospital) => {
            if (!hospital.location?.latitude) return;
            L.marker([hospital.location.latitude, hospital.location.longitude], {
                icon: L.divIcon({ className: '', html: '<div style="font-size:24px">🏥</div>', iconSize:[24,24], iconAnchor:[12,12] })
            }).addTo(previewMap).bindPopup(`<b>🏥 ${hospital.name}</b><br><small>${hospital.address}</small>`);
            allPoints.push([hospital.location.latitude, hospital.location.longitude]);
        });
        if (allPoints.length > 1) previewMap.fitBounds(L.latLngBounds(allPoints), { padding:[40,40], maxZoom:12 });
    }
}

// Display nearby ambulances on map (BEFORE booking)
function displayNearbyAmbulances() {
    if (!trackingMap || nearbyAmbulances.length === 0 || isBookingStarted) return;
    
    // Clear existing markers
    nearbyAmbulanceMarkers.forEach(marker => {
        if (marker && trackingMap.hasLayer(marker)) {
            trackingMap.removeLayer(marker);
        }
    });
    nearbyAmbulanceMarkers = [];
    
    nearbyAmbulances.forEach((ambulance, index) => {
        const icon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="font-size: 24px; opacity: 0.6;">🚑</div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        const marker = L.marker([ambulance.location.latitude, ambulance.location.longitude], { icon })
            .addTo(trackingMap)
            .bindPopup(`
                <b>Available Ambulance</b><br>
                ${ambulance.vehicleNumber}<br>
                Type: ${ambulance.type}<br>
                Distance: ${ambulance.distance.toFixed(1)} km<br>
                Driver: ${ambulance.driver?.name || 'N/A'}
            `);
        
        nearbyAmbulanceMarkers.push(marker);
    });
    
    console.log(`✓ Displayed ${nearbyAmbulanceMarkers.length} nearby ambulances on map`);
}

// Display nearby hospitals on map (BEFORE booking)
function displayNearbyHospitals() {
    if (!trackingMap || nearbyHospitals.length === 0 || isBookingStarted) return;
    
    // Clear existing markers
    nearbyHospitalMarkers.forEach(marker => {
        if (marker && trackingMap.hasLayer(marker)) {
            trackingMap.removeLayer(marker);
        }
    });
    nearbyHospitalMarkers = [];
    
    nearbyHospitals.forEach(hospital => {
        const icon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="font-size: 20px;">🏥</div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10],  // Center of icon
            popupAnchor: [0, -10]  // Popup above icon
        });
        
        const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            hospital.location.latitude,
            hospital.location.longitude
        );
        
        const marker = L.marker([hospital.location.latitude, hospital.location.longitude], { icon })
            .addTo(trackingMap)
            .bindPopup(`
                <b>${hospital.name}</b><br>
                ${hospital.address}<br>
                Distance: ${distance.toFixed(1)} km<br>
                📧 ${hospital.email || 'N/A'}
            `);
        
        nearbyHospitalMarkers.push(marker);
    });
    
    console.log(`✓ Displayed ${nearbyHospitalMarkers.length} nearby hospitals on map`);
}

// Clear all nearby markers (AFTER booking starts)
function clearNearbyMarkers() {
    console.log('🧹 Clearing nearby ambulances and hospitals from map...');
    
    // Remove nearby ambulance markers
    nearbyAmbulanceMarkers.forEach(marker => {
        if (marker && trackingMap.hasLayer(marker)) {
            trackingMap.removeLayer(marker);
        }
    });
    nearbyAmbulanceMarkers = [];
    
    // Remove nearby hospital markers
    nearbyHospitalMarkers.forEach(marker => {
        if (marker && trackingMap.hasLayer(marker)) {
            trackingMap.removeLayer(marker);
        }
    });
    nearbyHospitalMarkers = [];
    
    console.log('✓ Cleared all nearby markers');
}

// Initialize Socket.IO
function initializeSocket() {
    socket = io(CONFIG.SOCKET_URL);
    
    socket.on('connect', () => {
        console.log('✓ Connected to server');
    });
    
    socket.on('booking-update', (data) => {
        console.log('Booking update:', data);
        if (currentBooking && data.bookingId === currentBooking.bookingId) {
            loadBookingStatus();
        }
    });
    
    socket.on('ambulance-location', (data) => {
        console.log('📍 Received ambulance-location:', data);
        const bookingId = currentBooking?.bookingId || currentBooking?.bookingId;
        if (currentBooking && data.bookingId === bookingId) {
            // Wait for map to be ready if it's still initializing
            if (!trackingMap) {
                setTimeout(() => updateAmbulanceLocation(data.latitude, data.longitude), 500);
            } else {
                updateAmbulanceLocation(data.latitude, data.longitude);
            }
        }
    });
}

// Setup form submit
function setupFormSubmit() {
    const form = document.getElementById('booking-form');
    if (!form) {
        console.error('❌ Booking form not found!');
        return;
    }
    
    console.log('✅ Booking form found, attaching submit handler');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('📝 Form submitted, creating booking...');
        await createBooking();
    });
}

// Create booking
async function createBooking() {
    console.log('🚑 createBooking() called');
    console.log('📍 User location:', userLocation);
    
    if (!userLocation) {
        console.error('❌ No user location available');
        alert('Please wait for location to be detected');
        return;
    }
    
    // Get form values
    const contactNumber = document.getElementById('contact-number').value;
    const pickupAddress = document.getElementById('pickup-address').value;
    const incidentType = document.getElementById('incident-type').value;
    
    console.log('📋 Form data:', { contactNumber, pickupAddress, incidentType });
    
    // Get selected hospital
    const hospitalSelect = document.getElementById('hospital-select');
    const selectedHospitalId = hospitalSelect ? hospitalSelect.value : null;
    
    console.log('🏥 Selected hospital:', selectedHospitalId);
    
    const formData = {
        patientInfo: {
            phone: contactNumber
        },
        emergencyDetails: {
            description: incidentType
        },
        location: {
            pickup: {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                address: pickupAddress
            }
        },
        incidentType: incidentType,
        preferredHospitalId: selectedHospitalId || undefined // Include selected hospital
    };
    
    console.log('📤 Sending booking request:', formData);
    
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/booking/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        console.log('📥 Response status:', response.status);
        
        if (!response.ok) {
            const error = await response.json();
            console.error('❌ Booking failed:', error);
            throw new Error(error.error || 'Failed to create booking');
        }
        
        const data = await response.json();
        console.log('✅ Booking created:', data);
        currentBooking = { bookingId: data.bookingId };
        
        // Mark booking as started - this will hide nearby ambulances/hospitals
        isBookingStarted = true;
        window.isBookingStarted = true;
        
        // Show success toast
        if (window.toast) {
            window.toast.bookingCreated();
            // Show calming message after 5 seconds
            setTimeout(() => {
                window.toast.stayCalm();
            }, 5000);
            // Show help available message after 10 seconds (5 + 5)
            setTimeout(() => {
                window.toast.helpAvailable();
            }, 10000);
        }
        
        // Switch to tracking view
        document.getElementById('booking-form-section').style.display = 'none';
        document.getElementById('tracking-section').classList.add('active');
        document.getElementById('display-booking-id').textContent = data.bookingId;

        // Auto-copy booking ID to clipboard
        try {
            await navigator.clipboard.writeText(data.bookingId);
            console.log('✓ Booking ID copied to clipboard');
        } catch(e) { /* non-critical */ }

        // Show cancel button for 2 minutes
        const cancelBtn = document.getElementById('cancel-booking-btn');
        if (cancelBtn) {
            cancelBtn.style.display = 'inline-block';
            cancelBtn.onclick = () => cancelBooking(data.bookingId);
            setTimeout(() => { cancelBtn.style.display = 'none'; }, 120000);
        }
        
        // Scroll to top so user sees the tracking section
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Show emergency chatbot IMMEDIATELY
        console.log('🤖 Attempting to show chatbot...');
        if (window.emergencyChatbot) {
            console.log('✓ Chatbot found, showing now...');
            window.emergencyChatbot.show();
            window.emergencyChatbot.addWelcomeMessage();
        } else {
            console.error('❌ Chatbot not found on window object');
        }
        
        // Join socket room
        socket.emit('join-room', `booking-${data.bookingId}`);
        
        // Initialize map (this will NOT show nearby ambulances/hospitals anymore)
        initializeTrackingMap();
        
        // Clear all nearby markers from map
        clearNearbyMarkers();
        
        // Start polling for updates
        startStatusPolling();

        // Auto-start simulation so ambulance moves on the tracking map
        setTimeout(async () => {
            try {
                await fetch(`${CONFIG.API_BASE_URL}/booking/${data.bookingId}/simulate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                console.log('✓ Simulation started for booking', data.bookingId);
            } catch (simErr) {
                console.warn('Simulation start failed (non-critical):', simErr.message);
            }
        }, 2000); // 2s delay to let assignment happen first
        
    } catch (error) {
        console.error('Create booking error:', error);
        alert('Failed to create booking: ' + error.message);
    }
}

// Initialize tracking map
function initializeTrackingMap() {
    if (trackingMap) {
        trackingMap.remove();
        trackingMap = null;
    }

    // Use userLocation if available, else default to Chennai center
    const center = (userLocation && userLocation.latitude)
        ? [userLocation.latitude, userLocation.longitude]
        : [12.9249, 80.1000]; // Tambaram/Chennai default

    // Small delay to ensure the tracking section is visible before init
    setTimeout(() => {
        trackingMap = L.map('tracking-map').setView(center, 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(trackingMap);
        
        // CRITICAL: invalidateSize fixes misaligned tiles when map was hidden
        setTimeout(() => {
            trackingMap.invalidateSize();
            console.log('✓ Map size invalidated - tiles should align correctly');
        }, 300);

        // If tracking a specific booking, fetch its location and center map
        if (currentBooking && currentBooking.bookingId) {
            fetch(`${CONFIG.API_BASE_URL}/booking/${currentBooking.bookingId}`)
                .then(r => r.json())
                .then(data => {
                    const pickup = data.booking?.location?.pickup;
                    if (pickup && pickup.latitude) {
                        trackingMap.setView([pickup.latitude, pickup.longitude], 14);
                        L.marker([pickup.latitude, pickup.longitude], {
                            icon: L.divIcon({ className: '', html: '<div style="font-size:32px">📍</div>', iconSize:[32,32], iconAnchor:[16,32] })
                        }).addTo(trackingMap).bindPopup('<b>Pickup Location</b><br>' + (pickup.address || '')).openPopup();
                        setTimeout(() => trackingMap.invalidateSize(), 200);
                    }
                }).catch(() => {});
        }
        
        // Add patient marker
        const patientIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="font-size: 32px;">📍</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });
        
        patientMarker = L.marker([userLocation.latitude, userLocation.longitude], { icon: patientIcon })
            .addTo(trackingMap)
            .bindPopup('<b>Your Location</b>');
        
        console.log('✓ Tracking map initialized - showing only patient location');
    }, 100);
}

// Start status polling
function startStatusPolling() {
    loadBookingStatus();
    updateInterval = setInterval(loadBookingStatus, 5000); // Poll every 5 seconds
}

// Load booking status
async function loadBookingStatus() {
    if (!currentBooking) return;
    
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/booking/${currentBooking.bookingId}`);
        
        if (!response.ok) {
            throw new Error('Failed to load booking status');
        }
        
        const data = await response.json();
        updateUI(data.booking);
        
    } catch (error) {
        console.error('Load booking status error:', error);
    }
}

// Update UI based on booking status
function updateUI(booking) {
    currentBooking = booking;
    
    // Update status badge
    const statusBadge = document.getElementById('status-badge');
    const statusText = getStatusText(booking.status);
    statusBadge.textContent = statusText;
    statusBadge.className = 'status-badge status-' + booking.status;
    
    // Show toast notifications based on status changes
    if (window.toast && booking.status !== updateUI.lastStatus) {
        switch(booking.status) {
            case 'assigned':
                window.toast.ambulanceAssigned();
                break;
            case 'accepted':
                window.toast.ambulanceAccepted();
                break;
            case 'en-route':
                window.toast.ambulanceEnRoute();
                break;
            case 'arrived':
                window.toast.ambulanceArrived();
                break;
            case 'picked-up':
                window.toast.patientPickedUp();
                break;
            case 'transporting':
                window.toast.transporting();
                break;
            case 'completed':
                window.toast.tripCompleted();
                break;
        }
        updateUI.lastStatus = booking.status;
    }
    
    // Show/hide sections based on status
    if (booking.status === 'pending') {
        // Waiting for ambulance
        document.getElementById('ambulance-info-card').classList.add('hidden');
        document.getElementById('eta-card').classList.add('hidden');
        document.getElementById('success-message').classList.add('hidden');
        document.getElementById('hospital-info-card').classList.add('hidden');
        document.getElementById('traveling-banner').classList.add('hidden');
    }
    else if (booking.status === 'assigned' || booking.status === 'accepted') {
        // Ambulance assigned - SHOW AMBULANCE ON MAP IMMEDIATELY
        showAmbulanceInfo(booking);
        showHospitalInfo(booking); // Show hospital early
        showETA(booking); // Show ETA
        updateAmbulanceOnMap(booking); // ✅ SHOW AMBULANCE LOCATION ON MAP
        document.getElementById('success-message').classList.add('hidden');
        
        // Show traveling banner
        showTravelingBanner('Ambulance is preparing to come to your location');
    }
    else if (booking.status === 'en-route' || booking.status === 'arrived') {
        // Ambulance coming
        showAmbulanceInfo(booking);
        showHospitalInfo(booking); // Show hospital
        showETA(booking);
        updateAmbulanceOnMap(booking);
        document.getElementById('success-message').classList.add('hidden');
        
        // Show traveling banner
        const hospitalName = booking.location?.destination?.hospitalId?.hospitalName || 'hospital';
        showTravelingBanner(`Ambulance is traveling to pick you up`);
    }
    else if (booking.status === 'picked-up' || booking.status === 'transporting') {
        // Patient picked up
        document.getElementById('ambulance-info-card').classList.remove('hidden');
        document.getElementById('eta-card').classList.add('hidden');
        resetETACountdown();
        document.getElementById('success-message').classList.remove('hidden');
        showHospitalInfo(booking);
        updateAmbulanceOnMap(booking);
        
        // Show traveling banner for hospital
        const hospitalName = booking.location?.destination?.hospitalId?.hospitalName || 'hospital';
        showTravelingBanner(`Ambulance is traveling to ${hospitalName}`);
    }
    else if (booking.status === 'completed') {
        // Trip completed
        clearInterval(updateInterval);
        resetETACountdown();
        document.getElementById('success-message').classList.remove('hidden');
        // Update success message text
        const successMsg = document.getElementById('success-message');
        successMsg.querySelector('h2').textContent = 'Patient Successfully Delivered to Hospital!';
        successMsg.querySelector('p').textContent = 'The patient has been safely dropped at the hospital. Case closed.';
        document.getElementById('eta-card').classList.add('hidden');
        document.getElementById('traveling-banner').classList.add('hidden');
        statusBadge.textContent = 'Trip Completed ✅';
        statusBadge.className = 'status-badge status-completed';

        // Show feedback card
        const feedbackCard = document.getElementById('feedback-card');
        if (feedbackCard && feedbackCard.classList.contains('hidden')) {
            feedbackCard.classList.remove('hidden');
            feedbackCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            initStarRating();
        }
    }
}

// Get status text
function getStatusText(status) {
    const statusMap = {
        'pending': 'Waiting for ambulance...',
        'assigned': 'Ambulance Assigned',
        'accepted': 'Ambulance Accepted - Coming Soon',
        'en-route': 'Ambulance On The Way',
        'arrived': 'Ambulance Arrived at Location',
        'picked-up': 'Patient Picked Up',
        'transporting': 'Transporting to Hospital',
        'completed': 'Trip Completed'
    };
    return statusMap[status] || status;
}

// Show ambulance info
function showAmbulanceInfo(booking) {
    const card = document.getElementById('ambulance-info-card');
    card.classList.remove('hidden');
    
    if (booking.ambulanceId) {
        document.getElementById('ambulance-number').textContent = booking.ambulanceId.vehicleNumber || 'N/A';
        
        // Convert ambulance type to vehicle description
        const typeMap = {
            'basic': 'Type A - Basic Transport Ambulance',
            'advanced': 'Type B - Advanced Life Support Ambulance',
            'critical': 'Type C - Mobile ICU Ambulance'
        };
        const displayType = typeMap[booking.ambulanceId.type] || booking.ambulanceId.type || 'N/A';
        document.getElementById('ambulance-type').textContent = displayType;
    }
    
    if (booking.driverId) {
        document.getElementById('driver-name').textContent = booking.driverId.name || 'N/A';
        document.getElementById('driver-email').textContent = booking.driverId.email || 'N/A';
        document.getElementById('driver-phone').textContent = booking.driverId.phone || 'N/A';
    }
}

// ETA countdown state
let etaCountdownInterval = null;
let etaArrivalTime = null;

// Show ETA with live countdown
function showETA(booking) {
    const card = document.getElementById('eta-card');
    card.classList.remove('hidden');

    if (booking.driverId && booking.driverId.currentLocation) {
        const distance = calculateDistance(
            booking.driverId.currentLocation.latitude,
            booking.driverId.currentLocation.longitude,
            userLocation.latitude,
            userLocation.longitude
        );

        const etaMinutes = Math.ceil(distance / 40 * 60); // 40 km/h average
        document.getElementById('eta-distance').textContent = `Distance: ${distance.toFixed(1)} km`;

        // Set arrival time only once (don't reset on every poll)
        if (!etaArrivalTime) {
            etaArrivalTime = new Date(Date.now() + etaMinutes * 60 * 1000);
            startETACountdown();
        }
    } else {
        document.getElementById('eta-time').textContent = 'Calculating...';
        document.getElementById('eta-distance').textContent = 'Distance: Calculating...';
    }
}

function startETACountdown() {
    if (etaCountdownInterval) clearInterval(etaCountdownInterval);

    function tick() {
        if (!etaArrivalTime) return;
        const remaining = Math.max(0, etaArrivalTime - Date.now());
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);

        const el = document.getElementById('eta-time');
        if (!el) return;

        if (remaining <= 0) {
            el.textContent = 'Arriving now';
            clearInterval(etaCountdownInterval);
        } else if (mins > 0) {
            el.textContent = `${mins}m ${secs.toString().padStart(2, '0')}s`;
        } else {
            el.textContent = `${secs}s`;
        }
    }

    tick();
    etaCountdownInterval = setInterval(tick, 1000);
}

function resetETACountdown() {
    if (etaCountdownInterval) clearInterval(etaCountdownInterval);
    etaCountdownInterval = null;
    etaArrivalTime = null;
}

// Show hospital info
function showHospitalInfo(booking) {
    console.log('🏥 showHospitalInfo called', {
        hasDestination: !!booking.location?.destination,
        hasHospitalId: !!booking.location?.destination?.hospitalId,
        status: booking.status
    });
    
    if (booking.location && booking.location.destination && booking.location.destination.hospitalId) {
        const card = document.getElementById('hospital-info-card');
        card.classList.remove('hidden');
        
        const hospital = booking.location.destination.hospitalId;
        document.getElementById('hospital-name').textContent = hospital.hospitalName || 'N/A';
        document.getElementById('hospital-email').textContent = hospital.email || 'N/A';
        document.getElementById('hospital-address').textContent = hospital.hospitalAddress || 'N/A';
        document.getElementById('hospital-phone').textContent = hospital.phone || 'N/A';
        
        console.log('✓ Hospital info displayed:', hospital.hospitalName);
        
        // Add hospital marker to map - ALWAYS show it
        if (hospital.hospitalLocation && trackingMap) {
            // Remove old hospital marker if exists
            if (hospitalMarker) {
                trackingMap.removeLayer(hospitalMarker);
                hospitalMarker = null;
            }
            
            const hospitalIcon = L.divIcon({
                className: 'custom-marker',
                html: '<div style="font-size: 28px;">🏥</div>',
                iconSize: [28, 28],
                iconAnchor: [14, 14],  // Center of icon
                popupAnchor: [0, -14]  // Popup above icon
            });
            
            hospitalMarker = L.marker(
                [hospital.hospitalLocation.latitude, hospital.hospitalLocation.longitude],
                { icon: hospitalIcon }
            ).addTo(trackingMap).bindPopup(`
                <b>🏥 ${hospital.hospitalName}</b><br>
                📧 ${hospital.email || 'N/A'}<br>
                📞 ${hospital.phone || 'N/A'}<br>
                📍 ${hospital.hospitalAddress || 'N/A'}
            `).openPopup(); // Open popup immediately to show hospital
            
            console.log('✓ Hospital marker added to map at', hospital.hospitalLocation.latitude, hospital.hospitalLocation.longitude);
            
            // Draw road route to hospital
            if (ambulanceMarker && (booking.status === 'transporting' || booking.status === 'picked-up')) {
                if (routeLine) trackingMap.removeLayer(routeLine);
                const ambLatLng = ambulanceMarker.getLatLng();
                const hospLat = hospital.hospitalLocation.latitude;
                const hospLng = hospital.hospitalLocation.longitude;
                (async () => {
                    try {
                        const url = `${CONFIG.API_BASE_URL}/route?fromLat=${ambLatLng.lat}&fromLng=${ambLatLng.lng}&toLat=${hospLat}&toLng=${hospLng}`;
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.routes && data.routes[0]) {
                            const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                            if (routeLine) trackingMap.removeLayer(routeLine);
                            routeLine = L.polyline(coords, { color: '#10b981', weight: 5, opacity: 0.85 }).addTo(trackingMap);
                        } else { throw new Error('No route'); }
                    } catch(e) {
                        routeLine = L.polyline([[ambLatLng.lat, ambLatLng.lng], [hospLat, hospLng]], {
                            color: '#10b981', weight: 4, opacity: 0.7, dashArray: '10,10'
                        }).addTo(trackingMap);
                    }
                })();
            }
            
            // Fit map to show all markers
            const bounds = L.latLngBounds([
                [userLocation.latitude, userLocation.longitude],
                [hospital.hospitalLocation.latitude, hospital.hospitalLocation.longitude]
            ]);
            if (ambulanceMarker) {
                bounds.extend(ambulanceMarker.getLatLng());
            }
            trackingMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
            
            console.log('✓ Map bounds updated to show all markers');
        } else {
            console.warn('⚠️ Hospital location not available or map not initialized');
        }
    } else {
        console.warn('⚠️ No hospital assigned to booking yet');
    }
}

// Show traveling banner
function showTravelingBanner(text) {
    const banner = document.getElementById('traveling-banner');
    const textElement = document.getElementById('traveling-text');
    
    if (banner && textElement) {
        banner.classList.remove('hidden');
        textElement.textContent = text;
    }
}

// Update ambulance on map
function updateAmbulanceOnMap(booking) {
    console.log('📍 updateAmbulanceOnMap called', {
        hasDriver: !!booking.driverId,
        hasDriverLocation: !!booking.driverId?.currentLocation,
        hasAmbulance: !!booking.ambulanceId,
        status: booking.status
    });
    
    // Check if we have driver location
    if (!booking.driverId || !booking.driverId.currentLocation) {
        console.warn('⚠️ No driver location available yet');
        
        // Try to use ambulance location as fallback
        if (booking.ambulanceId && booking.ambulanceId.currentLocation) {
            console.log('✓ Using ambulance location as fallback');
            const location = booking.ambulanceId.currentLocation;
            
            if (!ambulanceMarker) {
                const ambulanceIcon = L.divIcon({
                    className: 'custom-marker ambulance-moving',
                    html: '<div style="font-size: 32px;">🚑</div>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],  // Center of icon
                    popupAnchor: [0, -16]  // Popup above icon
                });
                
                ambulanceMarker = L.marker([location.latitude, location.longitude], { icon: ambulanceIcon })
                    .addTo(trackingMap)
                    .bindPopup(`<b>Ambulance ${booking.ambulanceId?.vehicleNumber || ''}</b><br>Driver: ${booking.driverId?.name || 'Assigned'}`);
                
                console.log('✓ Ambulance marker created at', location.latitude, location.longitude);
            } else {
                // Update position with animation
                ambulanceMarker.setLatLng([location.latitude, location.longitude]);
            }
            
            // Add pulsing animation class
            const markerElement = ambulanceMarker.getElement();
            if (markerElement) {
                markerElement.classList.add('ambulance-moving');
            }
            
            // Draw route line
            const routeColor = '#dc2626'; // Red for pickup
            if (routeLine) {
                trackingMap.removeLayer(routeLine);
            }
            
            routeLine = L.polyline([
                [location.latitude, location.longitude],
                [userLocation.latitude, userLocation.longitude]
            ], {
                color: routeColor,
                weight: 4,
                opacity: 0.7,
                dashArray: '10, 10'
            }).addTo(trackingMap);
            
            // Fit map to show both
            const bounds = L.latLngBounds([
                [userLocation.latitude, userLocation.longitude],
                [location.latitude, location.longitude]
            ]);
            trackingMap.fitBounds(bounds, { padding: [50, 50] });
            
            return;
        }
        
        console.warn('⚠️ No ambulance location available either');
        return;
    }
    
    const location = booking.driverId.currentLocation;
    console.log('✓ Driver location:', location.latitude, location.longitude);
    
    if (!ambulanceMarker) {
        const ambulanceIcon = L.divIcon({
            className: 'custom-marker ambulance-moving',
            html: '<div style="font-size: 32px;">🚑</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16],  // Center of icon
            popupAnchor: [0, -16]  // Popup above icon
        });
        
        ambulanceMarker = L.marker([location.latitude, location.longitude], { icon: ambulanceIcon })
            .addTo(trackingMap)
            .bindPopup(`<b>Ambulance ${booking.ambulanceId?.vehicleNumber || ''}</b><br>Driver: ${booking.driverId?.name || 'N/A'}`);
        
        console.log('✓ Ambulance marker created');
    } else {
        ambulanceMarker.setLatLng([location.latitude, location.longitude]);
        console.log('✓ Ambulance marker updated');
    }
    
    // Add pulsing animation class to show movement
    const markerElement = ambulanceMarker.getElement();
    if (markerElement) {
        markerElement.classList.add('ambulance-moving');
    }
    
    // Draw route line from ambulance to patient (or hospital if picked up)
    const destLatLng = booking.status === 'transporting' && hospitalMarker
        ? hospitalMarker.getLatLng()
        : { lat: userLocation.latitude, lng: userLocation.longitude };

    // Remove old route line
    if (routeLine) trackingMap.removeLayer(routeLine);

    const routeColor = booking.status === 'transporting' ? '#10b981' : '#dc2626';

    // Fetch real road route from OSRM
    (async () => {
        try {
            const url = `${CONFIG.API_BASE_URL}/route?fromLat=${location.latitude}&fromLng=${location.longitude}&toLat=${destLatLng.lat}&toLng=${destLatLng.lng}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.routes && data.routes[0]) {
                const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                if (routeLine) trackingMap.removeLayer(routeLine);
                routeLine = L.polyline(coords, {
                    color: routeColor, weight: 5, opacity: 0.85
                }).addTo(trackingMap);
            } else { throw new Error('No route'); }
        } catch(e) {
            // Fallback straight line
            routeLine = L.polyline([
                [location.latitude, location.longitude],
                [destLatLng.lat, destLatLng.lng]
            ], { color: routeColor, weight: 4, opacity: 0.7, dashArray: '10,10' }).addTo(trackingMap);
        }
    })();
    
    console.log('✓ Route line drawn');
    
    // Fit map to show ambulance, patient, and route
    const bounds = L.latLngBounds([
        [userLocation.latitude, userLocation.longitude],
        [location.latitude, location.longitude]
    ]);
    
    if (hospitalMarker) {
        bounds.extend(hospitalMarker.getLatLng());
    }
    
    trackingMap.fitBounds(bounds, { padding: [50, 50] });
    console.log('✓ Map bounds updated');
}

// Update ambulance location (real-time with smooth animation)
function updateAmbulanceLocation(lat, lng) {
    if (!trackingMap) return;

    if (ambulanceMarker) {
        const currentLatLng = ambulanceMarker.getLatLng();
        const newLatLng = L.latLng(lat, lng);
        
        // Smooth animation over 1 second
        animateMarker(ambulanceMarker, currentLatLng, newLatLng, 1000);
        
        // Update route line if exists
        if (routeLine && trackingMap) {
            const destination = currentBooking?.status === 'transporting' && hospitalMarker
                ? hospitalMarker.getLatLng()
                : [userLocation.latitude, userLocation.longitude];
            
            trackingMap.removeLayer(routeLine);
            
            const routeColor = currentBooking?.status === 'transporting' ? '#10b981' : '#dc2626';
            routeLine = L.polyline([
                newLatLng,
                destination
            ], {
                color: routeColor,
                weight: 4,
                opacity: 0.7,
                dashArray: '10, 10'
            }).addTo(trackingMap);
        }
        
        // Auto-adjust map view to keep all markers visible
        adjustMapViewToShowAllMarkers();
    } else {
        // Create ambulance marker if it doesn't exist yet (simulation started before polling)
        const ambulanceIcon = L.divIcon({
            className: 'custom-marker ambulance-moving',
            html: '<div style="font-size: 32px;">🚑</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16]
        });
        ambulanceMarker = L.marker([lat, lng], { icon: ambulanceIcon })
            .addTo(trackingMap)
            .bindPopup('<b>Ambulance En Route</b>');

        // Draw initial route line
        routeLine = L.polyline([
            [lat, lng],
            [userLocation.latitude, userLocation.longitude]
        ], {
            color: '#dc2626',
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 10'
        }).addTo(trackingMap);

        adjustMapViewToShowAllMarkers();
        console.log('✓ Ambulance marker created from socket event at', lat, lng);
    }
}

function adjustMapViewToShowAllMarkers() {
    if (!trackingMap) return;
    
    const bounds = L.latLngBounds([]);
    let hasMarkers = false;
    
    // Include ambulance marker
    if (ambulanceMarker) {
        bounds.extend(ambulanceMarker.getLatLng());
        hasMarkers = true;
    }
    
    // Include patient/user location
    if (userLocation) {
        bounds.extend([userLocation.latitude, userLocation.longitude]);
        hasMarkers = true;
    }
    
    // Include hospital marker if transporting
    if (currentBooking?.status === 'transporting' && hospitalMarker) {
        bounds.extend(hospitalMarker.getLatLng());
        hasMarkers = true;
    }
    
    // Fit map to show all markers with padding - only if bounds changed significantly
    if (hasMarkers) {
        // Check if current view is significantly different
        const currentBounds = trackingMap.getBounds();
        const needsUpdate = !currentBounds.contains(bounds);
        
        if (needsUpdate) {
            trackingMap.fitBounds(bounds, { 
                padding: [60, 60],
                maxZoom: 14,
                animate: true,
                duration: 1
            });
        }
    }
}

// Animate marker movement smoothly
function animateMarker(marker, startLatLng, endLatLng, duration) {
    const startTime = Date.now();
    const startLat = startLatLng.lat;
    const startLng = startLatLng.lng;
    const endLat = endLatLng.lat;
    const endLng = endLatLng.lng;
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function for smooth animation
        const easeProgress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const currentLat = startLat + (endLat - startLat) * easeProgress;
        const currentLng = startLng + (endLng - startLng) * easeProgress;
        
        marker.setLatLng([currentLat, currentLng]);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    animate();
}

// Calculate distance
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

// Expose globals for panic button and other external scripts
window.createBooking = createBooking;

// Cancel booking (within 2 min window)
async function cancelBooking(bookingId) {
    if (!confirm('Cancel this booking?')) return;
    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/booking/${bookingId}/cancel`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            alert('Booking cancelled.');
            document.getElementById('cancel-booking-btn').style.display = 'none';
        } else {
            alert('Cannot cancel — ambulance already dispatched.');
        }
    } catch(e) { alert('Error cancelling booking.'); }
}

// ── FEEDBACK ─────────────────────────────────────────────────────────────────
let selectedRating = 0;

function initStarRating() {
    const stars = document.querySelectorAll('.star');
    stars.forEach(star => {
        star.addEventListener('mouseover', () => highlightStars(star.dataset.value));
        star.addEventListener('mouseout', () => highlightStars(selectedRating));
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.value);
            highlightStars(selectedRating);
        });
    });
}

function highlightStars(value) {
    document.querySelectorAll('.star').forEach(s => {
        s.textContent = parseInt(s.dataset.value) <= value ? '★' : '☆';
        s.style.color = parseInt(s.dataset.value) <= value ? '#f59e0b' : '#94a3b8';
    });
}

async function submitFeedback() {
    if (selectedRating === 0) {
        alert('Please select a star rating.');
        return;
    }
    const comment = document.getElementById('feedback-text').value.trim();
    const bookingId = currentBooking?.bookingId;

    try {
        await fetch(`${CONFIG.API_BASE_URL}/booking/${bookingId}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: selectedRating, comment })
        });
    } catch(e) { /* non-critical */ }

    document.getElementById('submit-feedback-btn').style.display = 'none';
    document.getElementById('star-rating').style.pointerEvents = 'none';
    document.getElementById('feedback-text').disabled = true;
    document.getElementById('feedback-thanks').style.display = 'block';
}
