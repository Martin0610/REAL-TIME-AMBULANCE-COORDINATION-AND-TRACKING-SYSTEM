// Driver Dashboard — Full GPS tracking + booking flow
let currentUser = null;
let currentTrip = null;
let tripMap = null;
let fullMap = null;
let refreshInterval = null;
let socket = null;
let gpsWatchId = null;
let patientMarker = null;
let driverMarker = null;
let routeLine = null;
let etaInterval = null;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function apiBase() {
    if (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) return CONFIG.API_BASE_URL;
    if (window.__BACKEND_URL__) return `${window.__BACKEND_URL__.replace(/\/$/, '')}/api`;
    const h = window.location.hostname;
    if ((h === 'localhost' || h === '127.0.0.1' || /^192\.168\./.test(h)) && window.location.port !== '5001') {
        return `http://${h}:5001/api`;
    }
    return `${window.location.origin}/api`;
}
function socketBase() {
    if (typeof CONFIG !== 'undefined' && CONFIG.SOCKET_URL) return CONFIG.SOCKET_URL;
    if (window.__BACKEND_URL__) return window.__BACKEND_URL__.replace(/\/$/, '');
    const h = window.location.hostname;
    if ((h === 'localhost' || h === '127.0.0.1' || /^192\.168\./.test(h)) && window.location.port !== '5001') {
        return `http://${h}:5001`;
    }
    return window.location.origin;
}
function authHeaders() {
    return { 'Authorization': 'Bearer ' + localStorage.getItem('authToken'), 'Content-Type': 'application/json' };
}
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('authToken');
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (!token || user.role !== 'driver') { window.location.href = 'provider-login.html'; return; }
    currentUser = user;

    setupNav();
    setupDutyToggle();
    loadDriverData();
    initSocket();
    startAutoRefresh();

    // If opened from SMS link, auto-navigate to current trip section
    const urlParams = new URLSearchParams(window.location.search);
    const linkedBookingId = urlParams.get('booking');
    if (linkedBookingId) {
        localStorage.setItem('highlightBooking', linkedBookingId);
        // Switch to current-trip section
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const tripNav = document.querySelector('[data-section="current-trip"]');
        if (tripNav) tripNav.classList.add('active');
        document.querySelectorAll('.dashboard-section').forEach(s => s.style.display = 'none');
        const tripSection = document.getElementById('current-trip');
        if (tripSection) tripSection.style.display = 'block';
    }
});

// ── SOCKET ───────────────────────────────────────────────────────────────────
function initSocket() {
    socket = io(socketBase());
    socket.on('connect', () => {
        console.log('✓ Socket connected');
        if (currentUser) socket.emit('join-room', 'driver-' + currentUser.id);
    });
    socket.on('disconnect', () => {
        console.log('⚠ Socket disconnected, reconnecting...');
        setTimeout(() => { if (!socket.connected) socket.connect(); }, 3000);
    });
    socket.on('new-booking-assigned', () => {
        playAlertSound();
        if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
        loadCurrentTrip();
    });
    socket.on('booking-update', () => loadCurrentTrip());
}

// Play alert sound for new booking
function playAlertSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.3, 0.6].forEach(delay => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.5, ctx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);
            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + 0.3);
        });
    } catch(e) { console.warn('Audio alert failed:', e.message); }
}

// ── GPS TRACKING ─────────────────────────────────────────────────────────────
function startGPS() {
    if (gpsWatchId !== null || !navigator.geolocation) return;
    gpsWatchId = navigator.geolocation.watchPosition(onGPSUpdate,
        err => console.warn('GPS error:', err.message),
        { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
    );
    console.log('📍 GPS started');
}
function stopGPS() {
    if (gpsWatchId !== null) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
}

let lastGPSLat = null, lastGPSLng = null;
async function onGPSUpdate(pos) {
    const { latitude: lat, longitude: lng } = pos.coords;

    // Skip tiny moves
    if (lastGPSLat !== null && haversineKm(lastGPSLat, lastGPSLng, lat, lng) * 1000 < 10) return;
    lastGPSLat = lat; lastGPSLng = lng;

    // Send to backend
    try {
        await fetch(apiBase() + '/driver/update-location', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ latitude: lat, longitude: lng })
        });
    } catch(e) { /* non-critical */ }

    // Socket.IO real-time to patient
    if (socket && currentTrip) {
        socket.emit('location-update', {
            driverId: currentUser.id,
            bookingId: currentTrip.bookingId,
            latitude: lat, longitude: lng
        });
    }

    // Update driver marker on map
    updateDriverMarker(lat, lng);

    // Update distance + ETA display
    if (currentTrip && currentTrip.location) {
        const pickup = currentTrip.location.pickup;
        const dist = haversineKm(lat, lng, pickup.latitude, pickup.longitude);
        const eta = Math.ceil(dist / 40 * 60);
        const distEl = document.getElementById('trip-distance');
        const etaEl = document.getElementById('trip-eta');
        if (distEl) distEl.textContent = dist.toFixed(2) + ' km';
        if (etaEl) etaEl.textContent = eta + ' min';
    }
}

// ── MAP ───────────────────────────────────────────────────────────────────────
function initTripMap(trip) {
    const container = document.getElementById('trip-map');
    if (!container) return;

    if (tripMap) { tripMap.remove(); tripMap = null; }
    patientMarker = null; driverMarker = null; routeLine = null;
    routeCoords = []; routeStepIndex = 0; routeFetched = false;
    if (routeAnimInterval) { clearInterval(routeAnimInterval); routeAnimInterval = null; }

    const pickup = trip.location.pickup;
    tripMap = L.map('trip-map').setView([pickup.latitude, pickup.longitude], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(tripMap);
    setTimeout(() => tripMap.invalidateSize(), 200);

    // Patient marker
    patientMarker = L.marker([pickup.latitude, pickup.longitude], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:28px">📍</div>', iconSize:[28,28], iconAnchor:[14,28] })
    }).addTo(tripMap).bindPopup('<b>Patient Location</b><br>' + (pickup.address || ''));

    // Hospital marker
    const dest = trip.location.destination;
    if (dest && dest.latitude) {
        L.marker([dest.latitude, dest.longitude], {
            icon: L.divIcon({ className: '', html: '<div style="font-size:24px">🏥</div>', iconSize:[24,24], iconAnchor:[12,12] })
        }).addTo(tripMap).bindPopup('<b>' + (dest.hospitalId?.hospitalName || 'Hospital') + '</b>');
    }

    // Create ambulance marker immediately at offset position (will move to route start once loaded)
    const startLat = lastGPSLat || (pickup.latitude + 0.02);
    const startLng = lastGPSLng || (pickup.longitude + 0.02);
    driverMarker = L.marker([startLat, startLng], {
        icon: L.divIcon({
            className: '',
            html: `<div style="background:#dc2626;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:3px solid white;">
                     <span style="font-size:18px;">🚑</span>
                   </div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        })
    }).addTo(tripMap).bindPopup('<b>Ambulance</b>');

    // Now fetch route and animate
    updateDriverMarker(startLat, startLng);
}

let routeCoords = [];       // full road route waypoints
let routeStepIndex = 0;     // current position along route
let routeAnimInterval = null;
let routeFetched = false;   // fetch route only once per trip

async function fetchRoadRoute(fromLat, fromLng, toLat, toLng) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            // Use backend proxy to avoid browser CORS/mixed-content issues
            const url = `${apiBase()}/route?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}`;
            console.log(`🛣️ Fetching route via proxy (attempt ${attempt + 1})`);
            const res = await fetch(url);
            const data = await res.json();
            if (data.routes && data.routes[0]) {
                const coords = data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
                console.log(`✅ Route fetched: ${coords.length} waypoints`);
                return coords;
            }
            console.warn('⚠️ No routes returned');
        } catch(e) {
            console.warn(`❌ Route fetch attempt ${attempt + 1} failed:`, e.message);
            if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
        }
    }
    console.error('❌ Route fetch failed — using straight line fallback');
    return null;
}

// Find closest index in routeCoords to a given lat/lng
function closestRouteIndex(lat, lng) {
    let minDist = Infinity, idx = 0;
    for (let i = routeStepIndex; i < routeCoords.length; i++) {
        const d = Math.hypot(routeCoords[i].lat - lat, routeCoords[i].lng - lng);
        if (d < minDist) { minDist = d; idx = i; }
    }
    return idx;
}

function animateAlongRoute(fromIndex) {
    if (routeAnimInterval) clearInterval(routeAnimInterval);
    routeStepIndex = fromIndex;

    // Place marker at the actual start of the route immediately
    if (routeCoords.length > 0 && driverMarker) {
        const start = routeCoords[fromIndex];
        driverMarker.setLatLng([start.lat, start.lng]);
    }

    routeAnimInterval = setInterval(() => {
        if (routeStepIndex >= routeCoords.length) {
            clearInterval(routeAnimInterval);
            // Snap exactly to patient pin on arrival
            if (currentTrip && driverMarker) {
                const pickup = currentTrip.location.pickup;
                driverMarker.setLatLng([pickup.latitude, pickup.longitude]);
                if (tripMap) tripMap.setView([pickup.latitude, pickup.longitude], 15, { animate: true });
            }
            return;
        }
        const { lat, lng } = routeCoords[routeStepIndex];
        if (driverMarker) driverMarker.setLatLng([lat, lng]);
        if (tripMap) tripMap.panTo([lat, lng], { animate: true, duration: 0.3 });
        routeStepIndex++;
    }, 200);
}

async function updateDriverMarker(lat, lng) {
    if (!tripMap) return;
    if (!currentTrip) return;
    const pickup = currentTrip.location.pickup;

    // Fetch route only once per trip (retry if failed)
    if (!routeFetched) {
        routeFetched = true;
        const coords = await fetchRoadRoute(lat, lng, pickup.latitude, pickup.longitude);

        if (coords && coords.length > 1) {
            routeCoords = coords;

            // Draw road route line
            if (routeLine) tripMap.removeLayer(routeLine);
            routeLine = L.polyline(coords.map(c => [c.lat, c.lng]), {
                color: '#dc2626', weight: 5, opacity: 0.85
            }).addTo(tripMap);

            // Place ambulance marker at route START (first waypoint)
            const startCoord = coords[0];
            if (driverMarker) {
                driverMarker.setLatLng([startCoord.lat, startCoord.lng]);
            } else {
                driverMarker = L.marker([startCoord.lat, startCoord.lng], {
                    icon: L.divIcon({ className: '', html: '<div style="background:#dc2626;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:3px solid white;"><span style="font-size:18px;">🚑</span></div>', iconSize:[36,36], iconAnchor:[18,18] })
                }).addTo(tripMap).bindPopup('<b>Ambulance</b>');
            }

            // Fit map to show full route
            tripMap.fitBounds(L.latLngBounds(coords.map(c => [c.lat, c.lng])), { padding: [60, 60], maxZoom: 15 });

            // Start animation along route
            animateAlongRoute(0);

        } else {
            // OSRM failed — reset so next GPS update retries
            routeFetched = false;

            // Place marker at GPS position
            if (driverMarker) {
                driverMarker.setLatLng([lat, lng]);
            } else {
                driverMarker = L.marker([lat, lng], {
                    icon: L.divIcon({ className: '', html: '<div style="background:#dc2626;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:3px solid white;"><span style="font-size:18px;">🚑</span></div>', iconSize:[36,36], iconAnchor:[18,18] })
                }).addTo(tripMap).bindPopup('<b>Ambulance</b>');
            }

            if (routeLine) tripMap.removeLayer(routeLine);
            routeLine = L.polyline([[lat, lng], [pickup.latitude, pickup.longitude]], {
                color: '#dc2626', weight: 4, opacity: 0.7, dashArray: '8,8'
            }).addTo(tripMap);

            tripMap.fitBounds(L.latLngBounds([[lat, lng], [pickup.latitude, pickup.longitude]]), { padding: [60, 60], maxZoom: 15 });
        }

    } else if (routeCoords.length > 0) {
        // On real GPS updates, advance animation to closest point on route
        const closest = closestRouteIndex(lat, lng);
        if (closest > routeStepIndex) routeStepIndex = closest;
    }
}

// ── LOAD DATA ─────────────────────────────────────────────────────────────────
async function loadDriverData() {
    try {
        const res = await fetch(apiBase() + '/auth/me', { headers: authHeaders() });
        if (!res.ok) throw new Error('Auth failed');
        const data = await res.json();
        currentUser = data.user || data;

        document.getElementById('driver-name').textContent = currentUser.name || '-';
        document.getElementById('driver-phone').textContent = currentUser.phone || '-';
        document.getElementById('driver-ambulance').textContent = currentUser.ambulanceId?.vehicleNumber || 'Not Assigned';
        document.getElementById('profile-name').textContent = currentUser.name || '-';
        document.getElementById('profile-email').textContent = currentUser.email || '-';
        document.getElementById('profile-phone').textContent = currentUser.phone || '-';
        document.getElementById('profile-license').textContent = currentUser.licenseNumber || '-';
        document.getElementById('profile-ambulance').textContent = currentUser.ambulanceId?.vehicleNumber || 'Not Assigned';

        const onDuty = currentUser.isOnDuty !== false;
        document.getElementById('duty-status').checked = onDuty;
        document.getElementById('duty-text').textContent = onDuty ? 'On Duty' : 'Off Duty';
        if (onDuty) startGPS();

        // Load weekly trip stats
        try {
            const statsRes = await fetch(apiBase() + '/driver/stats', { headers: authHeaders() });
            if (statsRes.ok) {
                const stats = await statsRes.json();
                const weeklyEl = document.getElementById('weekly-trips');
                if (weeklyEl) weeklyEl.textContent = stats.stats?.completedTrips || 0;
            }
        } catch(e) { /* non-critical */ }

        await loadCurrentTrip();
    } catch(e) {
        console.error('Load driver data error:', e);
    }
}

async function loadCurrentTrip() {
    try {
        const res = await fetch(apiBase() + '/driver/current-booking', { headers: authHeaders() });
        if (!res.ok) { showNoTrip(); return; }
        const data = await res.json();

        if (!data.hasActiveBooking || !data.booking) { showNoTrip(); return; }

        currentTrip = data.booking;

        // Join socket room for this booking
        if (socket) socket.emit('join-room', 'booking-' + currentTrip.bookingId);

        displayTrip(currentTrip);
    } catch(e) {
        console.error('Load trip error:', e);
        showNoTrip();
    }
}

function showNoTrip() {
    currentTrip = null;
    document.getElementById('no-trip-message').style.display = 'flex';
    document.getElementById('active-trip-container').style.display = 'none';
}

function displayTrip(trip) {
    document.getElementById('no-trip-message').style.display = 'none';
    document.getElementById('active-trip-container').style.display = 'block';

    document.getElementById('trip-booking-id').textContent = trip.bookingId;
    document.getElementById('trip-status').textContent = trip.status.toUpperCase();
    document.getElementById('trip-status').className = 'status-badge status-' + trip.status;
    document.getElementById('trip-patient-name').textContent = trip.patientInfo?.name || 'Unknown';
    document.getElementById('trip-patient-age').textContent = trip.patientInfo?.age || 'N/A';

    // Tap-to-call patient phone
    const phone = trip.patientInfo?.phone;
    const phoneEl = document.getElementById('trip-patient-phone');
    if (phoneEl) {
        if (phone) {
            phoneEl.innerHTML = `<a href="tel:+91${phone}" style="color:#3b82f6;font-weight:600;text-decoration:none;">📞 ${phone}</a>`;
        } else {
            phoneEl.textContent = 'N/A';
        }
    }
    document.getElementById('trip-emergency-desc').textContent = trip.emergencyDetails?.description || trip.incidentType || 'Emergency';
    document.getElementById('trip-pickup-address').textContent = trip.location?.pickup?.address || 'N/A';

    // Hospital name
    const hospital = trip.location?.destination?.hospitalId;
    if (hospital) {
        document.getElementById('trip-destination').textContent = hospital.hospitalName || 'N/A';
        const banner = document.getElementById('hospital-name-banner');
        const nameEl = document.getElementById('trip-hospital-name');
        if (banner) banner.style.display = 'block';
        if (nameEl) nameEl.textContent = hospital.hospitalName || 'N/A';
    }

    // Distance + ETA from GPS if available
    if (lastGPSLat && trip.location?.pickup) {
        const dist = haversineKm(lastGPSLat, lastGPSLng, trip.location.pickup.latitude, trip.location.pickup.longitude);
        document.getElementById('trip-distance').textContent = dist.toFixed(2) + ' km';
        document.getElementById('trip-eta').textContent = Math.ceil(dist / 40 * 60) + ' min';
    }

    // Buttons
    const btnAccept = document.getElementById('btn-accept');
    const btnStart  = document.getElementById('btn-start-journey') || document.getElementById('btn-start');
    const btnArrived = document.getElementById('btn-arrived');
    const btnPickup  = document.getElementById('btn-pickup');
    const btnComplete = document.getElementById('btn-complete');
    const reportCard = document.getElementById('criticalness-form-card');
    const travelBanner = document.getElementById('driver-traveling-banner');

    [btnAccept, btnStart, btnArrived, btnPickup, btnComplete].forEach(b => { if(b) b.style.display = 'none'; });
    if (reportCard) reportCard.style.display = 'none';
    if (travelBanner) travelBanner.style.display = 'none';

    switch(trip.status) {
        case 'assigned':
            if (btnAccept) { btnAccept.style.display = 'block'; btnAccept.onclick = () => acceptTrip(trip._id); }
            break;
        case 'accepted':
            if (btnStart) { btnStart.style.display = 'block'; btnStart.onclick = () => startJourney(trip._id); }
            break;
        case 'en-route':
            if (btnArrived) { btnArrived.style.display = 'block'; btnArrived.onclick = () => markArrived(trip._id); }
            if (travelBanner) { travelBanner.style.display = 'flex'; document.getElementById('driver-traveling-text').textContent = 'Traveling to patient location...'; }
            break;
        case 'arrived':
            if (btnPickup) { btnPickup.style.display = 'block'; btnPickup.onclick = () => pickupPatient(trip._id); }
            break;
        case 'picked-up':
            if (reportCard) reportCard.style.display = 'block';
            document.getElementById('btn-submit-report').onclick = () => submitReport(trip._id);
            if (travelBanner) { travelBanner.style.display = 'flex'; document.getElementById('driver-traveling-text').textContent = 'Patient on board — traveling to hospital...'; }
            break;
        case 'transporting':
            if (btnComplete) { btnComplete.style.display = 'block'; btnComplete.onclick = () => completeTrip(trip._id); }
            if (travelBanner) { travelBanner.style.display = 'flex'; document.getElementById('driver-traveling-text').textContent = 'Transporting patient to hospital...'; }
            break;
    }

    initTripMap(trip);
}

// ── TRIP ACTIONS ──────────────────────────────────────────────────────────────
async function acceptTrip(bookingDbId) {
    try {
        showLoading(true);
        const res = await fetch(apiBase() + '/driver/accept-booking/' + bookingDbId, { method: 'POST', headers: authHeaders() });
        const data = await res.json();
        showLoading(false);
        if (res.ok) { startGPS(); await loadCurrentTrip(); }
        else alert(data.error || 'Failed to accept');
    } catch(e) { showLoading(false); alert('Error: ' + e.message); }
}

async function startJourney(bookingDbId) {
    try {
        showLoading(true);
        const res = await fetch(apiBase() + '/driver/start-journey/' + bookingDbId, { method: 'POST', headers: authHeaders() });
        const data = await res.json();
        showLoading(false);
        if (res.ok) { startGPS(); await loadCurrentTrip(); }
        else alert(data.error || 'Failed to start journey');
    } catch(e) { showLoading(false); alert('Error: ' + e.message); }
}

async function markArrived(bookingDbId) {
    try {
        showLoading(true);
        const body = lastGPSLat ? { latitude: lastGPSLat, longitude: lastGPSLng } : {};
        const res = await fetch(apiBase() + '/driver/arrived/' + bookingDbId, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
        const data = await res.json();
        showLoading(false);
        if (res.ok) await loadCurrentTrip();
        else alert(data.error || 'Failed');
    } catch(e) { showLoading(false); alert('Error: ' + e.message); }
}

async function pickupPatient(bookingDbId) {
    try {
        showLoading(true);
        const res = await fetch(apiBase() + '/driver/pickup-patient/' + bookingDbId, { method: 'POST', headers: authHeaders() });
        const data = await res.json();
        showLoading(false);
        if (res.ok) await loadCurrentTrip();
        else alert(data.error || 'Failed');
    } catch(e) { showLoading(false); alert('Error: ' + e.message); }
}

async function submitReport(bookingDbId) {
    const severity = document.getElementById('severity-level')?.value;
    const criticalness = document.getElementById('criticalness-level')?.value;
    const injuryDetails = document.getElementById('injury-details')?.value;
    const description = document.getElementById('criticalness-description')?.value;

    if (!severity || !criticalness || !injuryDetails) { alert('Please fill all required fields'); return; }

    try {
        showLoading(true);
        const res = await fetch(apiBase() + '/driver/submit-report/' + bookingDbId, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ severity: parseInt(severity), criticalness, injuryDetails, description })
        });
        const data = await res.json();
        showLoading(false);
        if (res.ok) await loadCurrentTrip();
        else alert(data.error || 'Failed to submit report');
    } catch(e) { showLoading(false); alert('Error: ' + e.message); }
}

async function completeTrip(bookingDbId) {
    try {
        showLoading(true);
        const res = await fetch(apiBase() + '/driver/complete-trip/' + bookingDbId, { method: 'POST', headers: authHeaders() });
        const data = await res.json();
        showLoading(false);
        if (res.ok) { stopGPS(); currentTrip = null; await loadCurrentTrip(); }
        else alert(data.error || 'Failed to complete trip');
    } catch(e) { showLoading(false); alert('Error: ' + e.message); }
}

// ── DUTY TOGGLE ───────────────────────────────────────────────────────────────
function setupDutyToggle() {
    const toggle = document.getElementById('duty-status');
    if (!toggle) return;
    toggle.addEventListener('change', async (e) => {
        const isOnDuty = e.target.checked;
        try {
            const res = await fetch(apiBase() + '/auth/duty-status', {
                method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ isOnDuty })
            });
            if (res.ok) {
                document.getElementById('duty-text').textContent = isOnDuty ? 'On Duty' : 'Off Duty';
                isOnDuty ? startGPS() : stopGPS();
            } else { e.target.checked = !isOnDuty; }
        } catch(err) { e.target.checked = !isOnDuty; }
    });
}

// ── NAV ───────────────────────────────────────────────────────────────────────
function setupNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            const el = document.getElementById(section + '-section');
            if (el) el.classList.add('active');
            const titles = { 'current-trip':'Current Trip','trip-history':'Trip History','map-view':'Map View','profile':'Profile' };
            document.getElementById('page-title').textContent = titles[section] || section;
            if (section === 'trip-history') loadTripHistory();
        });
    });
}

// ── TRIP HISTORY ──────────────────────────────────────────────────────────────
async function loadTripHistory() {
    try {
        const res = await fetch(apiBase() + '/driver/history', { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const container = document.getElementById('trip-history-list');
        const trips = data.trips || [];
        if (trips.length === 0) { container.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No trip history</p></div>'; return; }
        container.innerHTML = trips.map(t => `
            <div class="history-card">
                <div class="history-header"><h4>${t.bookingId}</h4><span class="status-badge status-${t.status}">${t.status.toUpperCase()}</span></div>
                <div class="history-details">
                    <div class="detail-row"><i class="fas fa-calendar"></i><span>${new Date(t.createdAt).toLocaleString()}</span></div>
                    <div class="detail-row"><i class="fas fa-user-injured"></i><span>${t.patientInfo?.name || 'Unknown'} — ${t.patientInfo?.phone || 'N/A'}</span></div>
                    <div class="detail-row"><i class="fas fa-map-marker-alt"></i><span>${t.location?.pickup?.address || 'N/A'}</span></div>
                    <div class="detail-row"><i class="fas fa-hospital"></i><span>${t.location?.destination?.hospitalId?.hospitalName || 'N/A'}</span></div>
                </div>
            </div>`).join('');
    } catch(e) { console.error(e); }
}

// ── MISC ──────────────────────────────────────────────────────────────────────
function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        if (document.getElementById('current-trip-section')?.classList.contains('active')) loadCurrentTrip();
    }, 10000);
}
function refreshData() { loadDriverData(); }
function showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
}
function logout() {
    stopGPS();
    if (refreshInterval) clearInterval(refreshInterval);
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'entry.html';
}
