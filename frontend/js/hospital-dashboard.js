// Hospital Dashboard JavaScript
let currentUser = null;
let hospitalMap = null;
let refreshInterval = null;
let socket = null;

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    initializeDashboard();
    initializeSocket();
    loadHospitalData();
    startAutoRefresh();
});

// Check authentication
function checkAuth() {
    const token = localStorage.getItem('authToken');
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    
    if (!token || user.role !== 'hospital') {
        window.location.href = 'provider-login.html';
        return;
    }
    
    currentUser = user;
}

// Initialize Socket.IO
function initializeSocket() {
    socket = io(CONFIG.SOCKET_URL);
    
    socket.on('connect', () => {
        console.log('✓ Connected to server');
        socket.emit('join-room', `hospital-${currentUser._id}`);
    });
    
    socket.on('hospital-incoming', (data) => {
        console.log('Incoming ambulance update:', data);
        loadIncomingAmbulances();
        showNotification('Incoming Ambulance', data.message || 'New ambulance en route');
    });
    
    socket.on('booking-update', (data) => {
        console.log('Booking update received:', data);
        loadIncomingAmbulances();
    });
}

// Initialize dashboard
function initializeDashboard() {
    // Setup navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            switchSection(section);
        });
    });
}

// Switch section
function switchSection(section) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === section) {
            item.classList.add('active');
        }
    });
    
    // Update content
    document.querySelectorAll('.content-section').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${section}-section`).classList.add('active');
    
    // Update title
    const titles = {
        'incoming': 'Incoming Ambulances',
        'history': 'Patient History',
        'map-view': 'Map View',
        'stats': 'Statistics',
        'profile': 'Hospital Info'
    };
    document.getElementById('page-title').textContent = titles[section];
    
    // Load section data
    if (section === 'incoming') {
        loadIncomingAmbulances();
    } else if (section === 'history') {
        loadPatientHistory();
    } else if (section === 'map-view') {
        initializeHospitalMap();
    } else if (section === 'stats') {
        loadStatistics();
    }
}

// Load hospital data
async function loadHospitalData() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${CONFIG.API_BASE_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load hospital data');
        
        const data = await response.json();
        currentUser = data.user;
        
        // Update UI
        document.getElementById('hospital-name').textContent = currentUser.hospitalName;
        document.getElementById('hospital-address').textContent = currentUser.hospitalAddress;
        document.getElementById('hospital-capacity').textContent = `${currentUser.capacity} beds`;
        
        // Update profile
        document.getElementById('profile-hospital-name').textContent = currentUser.hospitalName;
        document.getElementById('profile-email').textContent = currentUser.email;
        document.getElementById('profile-phone').textContent = currentUser.phone;
        document.getElementById('profile-address').textContent = currentUser.hospitalAddress;
        document.getElementById('profile-capacity').textContent = `${currentUser.capacity} beds`;
        
        // Display facilities
        const facilitiesContainer = document.getElementById('profile-facilities');
        facilitiesContainer.innerHTML = currentUser.specialties.map(s => 
            `<span class="facility-tag">${s}</span>`
        ).join('');
        
        // Load incoming ambulances
        await loadIncomingAmbulances();
        
    } catch (error) {
        console.error('Load hospital data error:', error);
        showMessage('error', 'Failed to load hospital data');
    }
}

// Load incoming ambulances
async function loadIncomingAmbulances() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${CONFIG.API_BASE_URL}/hospital/incoming`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load incoming ambulances');
        
        const data = await response.json();
        displayIncomingAmbulances(data.bookings || []);
        updateStats(data.bookings || []);
        
    } catch (error) {
        console.error('Load incoming ambulances error:', error);
        displayIncomingAmbulances([]);
    }
}

// Display incoming ambulances
function displayIncomingAmbulances(bookings) {
    const container = document.getElementById('incoming-list');
    
    if (bookings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <h3>No Incoming Ambulances</h3>
                <p>All clear - no emergency cases en route</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = bookings.map(booking => {
        const hasReport = booking.driverReport && booking.driverReport.criticalness;
        const statusLabel = CONFIG.BOOKING_STATUS?.[booking.status]?.label || booking.status;
        
        // Calculate ETA if driver location available
        let eta = 'Calculating...';
        if (booking.driver?.currentLocation && booking.location?.destination) {
            const distance = calculateDistance(
                booking.driver.currentLocation.latitude,
                booking.driver.currentLocation.longitude,
                booking.location.destination.latitude,
                booking.location.destination.longitude
            );
            eta = `${Math.ceil(distance / 40 * 60)} min`;
        }
        
        return `
            <div class="incoming-card ${booking.emergencyDetails.severity >= 4 ? 'critical' : ''}">
                <div class="incoming-header">
                    <div>
                        <h3>${booking.bookingId}</h3>
                        <span class="status-badge status-${booking.status}">${statusLabel}</span>
                    </div>
                    <div class="severity-badge severity-${booking.emergencyDetails.severity}">
                        Level ${booking.emergencyDetails.severity}
                    </div>
                </div>
                
                <div class="incoming-details">
                    <div class="detail-row">
                        <i class="fas fa-user-injured"></i>
                        <div>
                            <label>Patient</label>
                            <span>${booking.patientInfo.name || 'Unknown'} (${booking.patientInfo.age || 'N/A'} yrs)</span>
                        </div>
                    </div>
                    
                    <div class="detail-row">
                        <i class="fas fa-ambulance"></i>
                        <div>
                            <label>Ambulance</label>
                            <span>${booking.ambulance?.vehicleNumber || 'N/A'} (${booking.ambulance?.type || 'N/A'})</span>
                        </div>
                    </div>
                    
                    <div class="detail-row">
                        <i class="fas fa-user-md"></i>
                        <div>
                            <label>Driver</label>
                            <span>${booking.driver?.name || 'N/A'} - ${booking.driver?.phone || 'N/A'}</span>
                        </div>
                    </div>
                    
                    <div class="detail-row">
                        <i class="fas fa-clock"></i>
                        <div>
                            <label>ETA</label>
                            <span class="eta-time">${eta}</span>
                        </div>
                    </div>
                    
                    <div class="detail-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <div>
                            <label>Pickup Location</label>
                            <span>${booking.pickupLocation?.address || booking.location?.pickup?.address || 'Unknown'}</span>
                        </div>
                    </div>
                    
                    <div class="detail-row">
                        <i class="fas fa-exclamation-circle"></i>
                        <div>
                            <label>Emergency</label>
                            <span>${booking.emergencyDetails.description || 'Emergency'}</span>
                        </div>
                    </div>
                    
                    ${hasReport ? `
                        <div class="injury-report-section">
                            <h4><i class="fas fa-notes-medical"></i> Patient Condition Report</h4>
                            <div class="injury-details">
                                <div class="injury-row">
                                    <label>Criticalness Level:</label>
                                    <span class="criticalness-badge criticalness-${booking.driverReport.criticalness}">
                                        ${booking.driverReport.criticalness.toUpperCase()}
                                    </span>
                                </div>
                                <div class="injury-row">
                                    <label>Injury Details:</label>
                                    <p>${booking.driverReport.injuryDetails || 'N/A'}</p>
                                </div>
                                ${booking.driverReport.notes ? `
                                <div class="injury-row">
                                    <label>Notes:</label>
                                    <p>${booking.driverReport.notes}</p>
                                </div>
                                ` : ''}
                                <div class="injury-row">
                                    <label>Reported At:</label>
                                    <span>${new Date(booking.driverReport.reportedAt).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <div class="no-report">
                            <i class="fas fa-info-circle"></i>
                            <span>Patient condition report pending - driver will submit after pickup</span>
                        </div>
                    `}
                </div>
                
                ${booking.emergencyDetails.severity >= 4 || (hasReport && (booking.driverReport.criticalness === 'critical' || booking.driverReport.criticalness === 'life-threatening')) ? `
                    <div class="preparation-alert">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Critical Case - Prepare:</strong> ICU bed, trauma team, emergency equipment
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Update stats
function updateStats(bookings) {
    const incoming = bookings.length;
    const critical = bookings.filter(b => 
        b.emergencyDetails.severity >= 4 || 
        (b.driverReport?.criticalness === 'critical' || b.driverReport?.criticalness === 'life-threatening')
    ).length;
    
    // Calculate average ETA
    let totalEta = 0;
    let etaCount = 0;
    bookings.forEach(booking => {
        if (booking.driver?.currentLocation && booking.location?.destination) {
            const distance = calculateDistance(
                booking.driver.currentLocation.latitude,
                booking.driver.currentLocation.longitude,
                booking.location.destination.latitude,
                booking.location.destination.longitude
            );
            totalEta += Math.ceil(distance / 40 * 60);
            etaCount++;
        }
    });
    const avgEta = etaCount > 0 ? Math.round(totalEta / etaCount) : 0;
    
    document.getElementById('stat-incoming').textContent = incoming;
    document.getElementById('stat-critical').textContent = critical;
    document.getElementById('stat-avg-eta').textContent = avgEta > 0 ? `${avgEta} min` : '-';
    document.getElementById('incoming-count').textContent = incoming;
}

// Load patient history
async function loadPatientHistory() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${CONFIG.API_BASE_URL}/hospital/history`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load history');
        
        const data = await response.json();
        displayPatientHistory(data.bookings || []);
        
    } catch (error) {
        console.error('Load patient history error:', error);
        displayPatientHistory([]);
    }
}

// Display patient history
function displayPatientHistory(bookings) {
    const container = document.getElementById('patient-history-list');
    
    if (bookings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>No patient history</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = bookings.map(booking => {
        const hasReport = booking.driverReport && booking.driverReport.criticalness;
        
        return `
        <div class="history-card">
            <div class="history-header">
                <div>
                    <h4>${booking.bookingId}</h4>
                    <span class="status-badge status-${booking.status}">${booking.status.toUpperCase()}</span>
                </div>
                <span class="history-date">${new Date(booking.createdAt).toLocaleString()}</span>
            </div>
            <div class="history-details">
                <div class="detail-row">
                    <i class="fas fa-user-injured"></i>
                    <span><strong>Patient:</strong> ${booking.patientInfo?.name || 'Unknown'} (${booking.patientInfo?.age || 'N/A'} yrs, ${booking.patientInfo?.gender || 'N/A'})</span>
                </div>
                <div class="detail-row">
                    <i class="fas fa-phone"></i>
                    <span><strong>Contact:</strong> ${booking.patientInfo?.phone || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <i class="fas fa-ambulance"></i>
                    <span><strong>Ambulance:</strong> ${booking.ambulanceId?.vehicleNumber || 'N/A'} (${booking.ambulanceId?.type || 'N/A'})</span>
                </div>
                <div class="detail-row">
                    <i class="fas fa-user-md"></i>
                    <span><strong>Driver:</strong> ${booking.driverId?.name || 'N/A'} - ${booking.driverId?.phone || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <i class="fas fa-map-marker-alt"></i>
                    <span><strong>Pickup:</strong> ${booking.location?.pickup?.address || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <i class="fas fa-exclamation-circle"></i>
                    <span><strong>Emergency:</strong> ${booking.emergencyDetails?.description || 'Emergency'} (Severity: ${booking.emergencyDetails?.severity || 'N/A'})</span>
                </div>
                ${hasReport ? `
                    <div class="injury-report-section">
                        <h4><i class="fas fa-notes-medical"></i> Patient Condition Report</h4>
                        <div class="injury-details">
                            <div class="injury-row">
                                <label>Criticalness:</label>
                                <span class="criticalness-badge criticalness-${booking.driverReport.criticalness}">
                                    ${booking.driverReport.criticalness.toUpperCase()}
                                </span>
                            </div>
                            <div class="injury-row">
                                <label>Injury Details:</label>
                                <p>${booking.driverReport.injuryDetails || 'N/A'}</p>
                            </div>
                            ${booking.driverReport.notes ? `
                            <div class="injury-row">
                                <label>Notes:</label>
                                <p>${booking.driverReport.notes}</p>
                            </div>
                            ` : ''}
                            <div class="injury-row">
                                <label>Reported At:</label>
                                <span>${new Date(booking.driverReport.reportedAt).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                ` : `
                    <div class="no-report">
                        <i class="fas fa-info-circle"></i>
                        <span>No patient condition report submitted</span>
                    </div>
                `}
                ${booking.completedAt ? `
                    <div class="detail-row">
                        <i class="fas fa-check-circle"></i>
                        <span><strong>Completed:</strong> ${new Date(booking.completedAt).toLocaleString()}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    }).join('');
}

// Initialize hospital map
function initializeHospitalMap() {
    if (hospitalMap) return;
    
    setTimeout(() => {
        hospitalMap = MapService.createMap('hospital-map', {
            center: [currentUser.hospitalLocation.latitude, currentUser.hospitalLocation.longitude],
            zoom: 13
        });
        
        // Add hospital marker
        MapService.addHospitalMarker('hospital-map',
            currentUser._id,
            currentUser.hospitalLocation.latitude,
            currentUser.hospitalLocation.longitude,
            {
                name: currentUser.hospitalName,
                address: currentUser.hospitalAddress,
                capacity: currentUser.capacity,
                specialties: currentUser.specialties
            }
        );
        
        // Load and display incoming ambulances on map
        loadIncomingOnMap();
    }, 100);
}

// Load incoming ambulances on map
async function loadIncomingOnMap() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${CONFIG.API_BASE_URL}/hospital/incoming`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        
        data.bookings.forEach(booking => {
            if (booking.driver?.currentLocation) {
                MapService.addAmbulanceMarker('hospital-map',
                    booking.ambulance._id,
                    booking.driver.currentLocation.latitude,
                    booking.driver.currentLocation.longitude,
                    {
                        vehicleNumber: booking.ambulance.vehicleNumber,
                        type: booking.ambulance.type,
                        status: booking.status,
                        driver: booking.driver.name,
                        eta: booking.eta,
                        useEmoji: true
                    }
                );
            }
        });
        
    } catch (error) {
        console.error('Load incoming on map error:', error);
    }
}

// Load statistics
async function loadStatistics() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${CONFIG.API_BASE_URL}/hospital/stats`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load statistics');
        
        const data = await response.json();
        displayStatistics(data);
        
    } catch (error) {
        console.error('Load statistics error:', error);
    }
}

// Display statistics
function displayStatistics(stats) {
    // Today's stats
    document.getElementById('stats-today-total').textContent = stats.today?.total || 0;
    document.getElementById('stats-today-critical').textContent = stats.today?.critical || 0;
    document.getElementById('stats-today-response').textContent = stats.today?.avgResponse || '-';
    
    // Week's stats
    document.getElementById('stats-week-total').textContent = stats.week?.total || 0;
    document.getElementById('stats-week-critical').textContent = stats.week?.critical || 0;
    document.getElementById('stats-week-response').textContent = stats.week?.avgResponse || '-';
}

// Auto refresh
function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        if (document.getElementById('incoming-section').classList.contains('active')) {
            loadIncomingAmbulances();
        }
    }, 15000); // Refresh every 15 seconds
}

// Refresh data
function refreshData() {
    loadHospitalData();
}

// Show loading
function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

// Calculate distance between two points (Haversine formula)
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

// Show message
function showMessage(type, message) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 500;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Show notification
function showNotification(title, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: message, icon: '/ambulance-icon.png' });
    }
    showMessage('info', `${title}: ${message}`);
}

// Logout
function logout() {
    if (refreshInterval) clearInterval(refreshInterval);
    if (socket) socket.disconnect();
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'entry.html';
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
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
    .injury-report-section {
        margin-top: 16px;
        padding: 16px;
        background: #f0f9ff;
        border-radius: 8px;
        border-left: 4px solid #3b82f6;
    }
    .injury-report-section h4 {
        margin: 0 0 12px 0;
        color: #1e40af;
        font-size: 14px;
    }
    .injury-details {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .injury-row {
        display: flex;
        gap: 8px;
        align-items: flex-start;
    }
    .injury-row label {
        font-weight: 600;
        min-width: 100px;
        color: #64748b;
    }
    .injury-row p {
        margin: 0;
        color: #334155;
    }
    .no-report {
        margin-top: 16px;
        padding: 12px;
        background: #f1f5f9;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #64748b;
        font-size: 14px;
    }
    .preparation-alert {
        margin-top: 16px;
        padding: 12px 16px;
        background: #fef2f2;
        border-left: 4px solid #dc2626;
        border-radius: 8px;
        color: #991b1b;
        font-size: 14px;
    }
    .preparation-alert i {
        color: #dc2626;
        margin-right: 8px;
    }
`;
document.head.appendChild(style);
