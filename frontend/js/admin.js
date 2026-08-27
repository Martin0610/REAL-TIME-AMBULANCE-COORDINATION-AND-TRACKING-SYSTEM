// Admin Dashboard JavaScript
let currentAction = null;
let currentUserId = null;

// Dynamic API base — works on localhost, mobile network, and production
const ADMIN_API = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL)
    ? CONFIG.API_BASE_URL
    : ((function() {
        if (window.__BACKEND_URL__) return `${window.__BACKEND_URL__.replace(/\/$/, '')}/api`;
        const host = window.location.hostname;
        if ((host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host)) && window.location.port !== '5001') {
            return `http://${host}:5001/api`;
        }
        return `${window.location.origin}/api`;
    })());

document.addEventListener('DOMContentLoaded', function() {
    // Check if admin is logged in
    checkAuth();
    
    // Initialize dashboard
    initializeDashboard();
    
    // Load initial data
    loadPendingRegistrations();
    loadSystemOverview();
});

// Check authentication
function checkAuth() {
    const token = localStorage.getItem('authToken');
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    
    if (!token || user.role !== 'admin') {
        window.location.href = 'provider-login.html';
        return;
    }
    
    // Display admin info
    document.getElementById('admin-name').textContent = user.name || 'Admin';
    document.getElementById('admin-email').textContent = user.email || '';
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
    
    // Setup tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn);
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
        'pending': 'Pending Approvals',
        'approved': 'Approved Users',
        'overview': 'System Overview',
        'analytics': 'Analytics Dashboard',
        'reviews': 'Customer Reviews'
    };
    document.getElementById('page-title').textContent = titles[section] || section;
    
    // Load data for section
    if (section === 'approved') {
        loadApprovedUsers();
    } else if (section === 'overview') {
        loadSystemOverview();
    } else if (section === 'analytics') {
        loadAnalytics('24h', document.querySelector('.period-btn.active'));
    } else if (section === 'reviews') {
        loadReviews();
    }
}

// Switch tab
function switchTab(btn) {
    const parent = btn.closest('.content-section') || btn.closest('.section');
    const tabName = btn.getAttribute('data-tab');
    
    // Update buttons
    parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update content
    parent.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    parent.querySelector(`#${tabName}-tab`).classList.add('active');
}

// Load pending registrations
async function loadPendingRegistrations() {
    showLoading(true);
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${ADMIN_API}/admin/pending-registrations`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load pending registrations');
        
        const data = await response.json();
        
        // Display drivers
        displayPendingDrivers(data.drivers || []);
        
        // Display hospitals
        displayPendingHospitals(data.hospitals || []);
        
        // Update counts
        const totalPending = (data.drivers?.length || 0) + (data.hospitals?.length || 0);
        document.getElementById('pending-count').textContent = totalPending;
        document.getElementById('drivers-count').textContent = data.drivers?.length || 0;
        document.getElementById('hospitals-count').textContent = data.hospitals?.length || 0;
        
        showLoading(false);
    } catch (error) {
        console.error('Error loading pending registrations:', error);
        showLoading(false);
        showMessage('error', 'Failed to load pending registrations');
    }
}

// Display pending drivers
function displayPendingDrivers(drivers) {
    const container = document.getElementById('pending-drivers');
    
    if (drivers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No pending driver registrations</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = drivers.map(driver => `
        <div class="approval-card">
            <div class="card-header">
                <div class="card-title">${driver.name}</div>
                <div class="card-type">Driver</div>
            </div>
            <div class="card-info">
                <div class="info-row">
                    <div class="info-label">Email:</div>
                    <div class="info-value">${driver.email}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Phone:</div>
                    <div class="info-value">${driver.phone}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">License:</div>
                    <div class="info-value">${driver.licenseNumber}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Registered:</div>
                    <div class="info-value">${new Date(driver.createdAt).toLocaleDateString()}</div>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-approve" onclick="approveDriver('${driver._id}', '${driver.name}')">
                    <i class="fas fa-check"></i>
                    Approve & Auto-Assign Ambulance
                </button>
                <button class="btn btn-reject" onclick="rejectUser('${driver._id}', '${driver.name}', 'driver')">
                    <i class="fas fa-times"></i>
                    Reject
                </button>
            </div>
        </div>
    `).join('');
}

// Display pending hospitals
function displayPendingHospitals(hospitals) {
    const container = document.getElementById('pending-hospitals');
    
    if (hospitals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No pending hospital registrations</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = hospitals.map(hospital => `
        <div class="approval-card">
            <div class="card-header">
                <div class="card-title">${hospital.hospitalName}</div>
                <div class="card-type">Hospital</div>
            </div>
            <div class="card-info">
                <div class="info-row">
                    <div class="info-label">Email:</div>
                    <div class="info-value">${hospital.email}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Phone:</div>
                    <div class="info-value">${hospital.phone}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Address:</div>
                    <div class="info-value">${hospital.hospitalAddress}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Capacity:</div>
                    <div class="info-value">${hospital.capacity} beds</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Facilities:</div>
                    <div class="info-value">
                        <div class="facilities-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
                            ${(()=>{ try { const sp = Array.isArray(hospital.specialties) ? hospital.specialties : JSON.parse(hospital.specialties || '[]'); return sp.map(s=>`<span style="background:#dbeafe;color:#1d4ed8;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:500;">${s}</span>`).join(''); } catch(e){ return hospital.specialties || ''; } })()}
                        </div>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-label">Registered:</div>
                    <div class="info-value">${new Date(hospital.createdAt).toLocaleDateString()}</div>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-approve" onclick="approveHospital('${hospital._id}', '${hospital.hospitalName}')">
                    <i class="fas fa-check"></i>
                    Approve
                </button>
                <button class="btn btn-reject" onclick="rejectUser('${hospital._id}', '${hospital.hospitalName}', 'hospital')">
                    <i class="fas fa-times"></i>
                    Reject
                </button>
            </div>
        </div>
    `).join('');
}

// Approve driver (with automatic ambulance assignment)
async function approveDriver(driverId, driverName) {
    currentAction = () => executeApproveDriver(driverId, driverName);
    currentUserId = driverId;
    
    document.getElementById('confirm-title').textContent = 'Approve Driver';
    document.getElementById('confirm-body').innerHTML = `
        <p>Are you sure you want to approve <strong>${driverName}</strong>?</p>
        <p style="margin-top: 15px; padding: 15px; background: #f0f9ff; border-radius: 8px; color: #1e40af;">
            <i class="fas fa-info-circle"></i> 
            An available ambulance will be automatically assigned to this driver.
        </p>
    `;
    document.getElementById('confirm-modal').style.display = 'flex';
}

// Execute approve driver
async function executeApproveDriver(driverId, driverName) {
    showLoading(true);
    closeModal();
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${ADMIN_API}/admin/approve-driver/${driverId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to approve driver');
        }
        
        const data = await response.json();
        
        showLoading(false);
        
        // Show success message with detailed info
        const successMessage = `
            <div style="text-align: left;">
                <p style="margin-bottom: 12px;"><strong>${driverName}</strong> has been approved successfully!</p>
                <div style="background: #f0f9ff; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                    <p style="margin: 4px 0;"><strong>Ambulance Assigned:</strong> ${data.ambulance?.vehicleNumber || 'N/A'}</p>
                    <p style="margin: 4px 0;"><strong>Type:</strong> ${data.ambulance?.type || 'N/A'}</p>
                </div>
                <p style="color: #059669; font-size: 14px;">
                    <i class="fas fa-check-circle"></i> 
                    The driver is now visible in the "Approved Users" section and will appear on the patient map once they go on duty.
                </p>
            </div>
        `;
        
        showMessage('success', 'Driver Approved!', successMessage);
        
        // Reload all data
        await loadPendingRegistrations();
        await loadApprovedUsers();
        await loadSystemOverview();
        
        // Auto-switch to approved users tab after 2 seconds
        setTimeout(() => {
            switchSection('approved');
        }, 2000);
        
    } catch (error) {
        showLoading(false);
        console.error('Error approving driver:', error);
        showMessage('error', 'Failed to approve driver', error.message);
    }
}

// Approve hospital
async function approveHospital(hospitalId, hospitalName) {
    currentAction = () => executeApproveHospital(hospitalId, hospitalName);
    currentUserId = hospitalId;
    
    document.getElementById('confirm-title').textContent = 'Approve Hospital';
    document.getElementById('confirm-body').innerHTML = `
        <p>Are you sure you want to approve <strong>${hospitalName}</strong>?</p>
        <p style="margin-top: 15px; padding: 15px; background: #f0fdf4; border-radius: 8px; color: #166534;">
            <i class="fas fa-check-circle"></i> 
            The hospital will be activated and can start receiving ambulances.
        </p>
    `;
    document.getElementById('confirm-modal').style.display = 'flex';
}

// Execute approve hospital
async function executeApproveHospital(hospitalId, hospitalName) {
    showLoading(true);
    closeModal();
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${ADMIN_API}/admin/approve-hospital/${hospitalId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to approve hospital');
        }
        
        showLoading(false);
        showMessage('success', `${hospitalName} has been approved successfully!`);
        
        // Reload data
        loadPendingRegistrations();
        loadApprovedUsers();
        loadSystemOverview();
    } catch (error) {
        showLoading(false);
        console.error('Error approving hospital:', error);
        showMessage('error', 'Failed to approve hospital', error.message);
    }
}

// Reject user
async function rejectUser(userId, userName, userType) {
    const reason = prompt(`Please provide a reason for rejecting ${userName}:`);
    if (!reason) return;
    
    showLoading(true);
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${ADMIN_API}/admin/reject-registration/${userId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        if (!response.ok) throw new Error('Failed to reject registration');
        
        showLoading(false);
        showMessage('success', `${userName} has been rejected.`);
        
        // Reload data
        loadPendingRegistrations();
    } catch (error) {
        showLoading(false);
        console.error('Error rejecting user:', error);
        showMessage('error', 'Failed to reject registration');
    }
}

// Load approved users
async function loadApprovedUsers() {
    showLoading(true);
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${ADMIN_API}/admin/approved-users`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load approved users');
        
        const data = await response.json();
        
        // Display approved drivers
        displayApprovedDrivers(data.drivers || []);
        
        // Display approved hospitals
        displayApprovedHospitals(data.hospitals || []);
        
        showLoading(false);
    } catch (error) {
        console.error('Error loading approved users:', error);
        showLoading(false);
        showMessage('error', 'Failed to load approved users');
    }
}

// Display approved drivers
function displayApprovedDrivers(drivers) {
    const container = document.getElementById('approved-drivers-list');
    
    if (drivers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-check"></i>
                <p>No approved drivers</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>License</th>
                    <th>Ambulance</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${drivers.map(driver => `
                    <tr>
                        <td>${driver.name}</td>
                        <td>${driver.email}</td>
                        <td>${driver.phone}</td>
                        <td>${driver.licenseNumber}</td>
                        <td>
                            ${driver.ambulanceId ? 
                                `<span class="ambulance-badge ${driver.ambulanceId.type}">
                                    ${driver.ambulanceId.vehicleNumber} (${driver.ambulanceId.type})
                                </span>` : 
                                '<span class="status-badge inactive">Not Assigned</span>'
                            }
                        </td>
                        <td>
                            <span class="status-badge ${driver.isOnDuty ? 'active' : 'inactive'}">
                                ${driver.isOnDuty ? 'On Duty' : 'Off Duty'}
                            </span>
                        </td>
                        <td>
                            <button class="btn-icon" onclick="viewDriverDetails('${driver._id}')" title="View Details">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon danger" onclick="deactivateUser('${driver._id}', '${driver.name}', 'driver')" title="Deactivate">
                                <i class="fas fa-ban"></i>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Display approved hospitals
function displayApprovedHospitals(hospitals) {
    const container = document.getElementById('approved-hospitals-list');
    
    if (hospitals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-hospital"></i>
                <p>No approved hospitals</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Hospital Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Capacity</th>
                    <th>Facilities</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${hospitals.map(hospital => `
                    <tr>
                        <td><strong>${hospital.hospitalName}</strong></td>
                        <td>${hospital.email}</td>
                        <td>${hospital.phone}</td>
                        <td>${hospital.hospitalAddress}</td>
                        <td>${hospital.capacity} beds</td>
                        <td>
                            <div class="facilities-compact">
                                ${(()=>{ const sp = Array.isArray(hospital.specialties) ? hospital.specialties : (typeof hospital.specialties === 'string' ? JSON.parse(hospital.specialties) : []); return sp.slice(0,2).map(s=>`<span class="facility-tag-small">${s}</span>`).join('') + (sp.length>2?`<span class="more-tag">+${sp.length-2}</span>`:''); })()}
                            </div>
                        </td>
                        <td>
                            <button class="btn-icon" onclick="viewHospitalDetails('${hospital._id}')" title="View Details">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon danger" onclick="deactivateUser('${hospital._id}', '${hospital.hospitalName}', 'hospital')" title="Deactivate">
                                <i class="fas fa-ban"></i>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// View driver details (placeholder)
function viewDriverDetails(driverId) {
    showMessage('info', 'Driver Details', 'Detailed view coming soon...');
}

// View hospital details (placeholder)
function viewHospitalDetails(hospitalId) {
    showMessage('info', 'Hospital Details', 'Detailed view coming soon...');
}

// Deactivate user
async function deactivateUser(userId, userName, userType) {
    const confirmed = confirm(`Are you sure you want to deactivate ${userName}? They will no longer be able to access the system.`);
    if (!confirmed) return;
    
    showLoading(true);
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${ADMIN_API}/admin/deactivate-user/${userId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Failed to deactivate user');
        
        showLoading(false);
        showMessage('success', `${userName} has been deactivated.`);
        
        // Reload approved users
        loadApprovedUsers();
    } catch (error) {
        showLoading(false);
        console.error('Error deactivating user:', error);
        showMessage('error', 'Failed to deactivate user');
    }
}

// Load system overview
async function loadSystemOverview() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${ADMIN_API}/admin/dashboard`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load overview');
        
        const data = await response.json();
        
        // Update stats
        document.getElementById('total-ambulances').textContent = data.overview?.ambulances?.total || 0;
        document.getElementById('total-drivers').textContent = data.overview?.drivers?.onDuty || 0;
        document.getElementById('total-hospitals').textContent = data.overview?.hospitals?.active || 0;
        
        // Calculate pending approvals
        const pending = await getPendingCount();
        document.getElementById('pending-approvals').textContent = pending;
        
    } catch (error) {
        console.error('Error loading overview:', error);
    }
}

// Get pending count
async function getPendingCount() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${ADMIN_API}/admin/pending-registrations`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) return 0;
        
        const data = await response.json();
        return (data.drivers?.length || 0) + (data.hospitals?.length || 0);
    } catch (error) {
        return 0;
    }
}

// Confirm action
function confirmAction() {
    if (currentAction) {
        currentAction();
    }
}

// Close modal
function closeModal() {
    document.getElementById('confirm-modal').style.display = 'none';
    currentAction = null;
    currentUserId = null;
}

// Close message modal
function closeMessageModal() {
    document.getElementById('message-modal').style.display = 'none';
}

// Show message
function showMessage(type, title, body = '') {
    const modal = document.getElementById('message-modal');
    const header = document.getElementById('message-header');
    const titleEl = document.getElementById('message-title');
    const bodyEl = document.getElementById('message-body');
    
    header.className = `modal-header ${type}`;
    titleEl.innerHTML = type === 'success' ? 
        '<i class="fas fa-check-circle"></i> ' + title : 
        type === 'error' ?
        '<i class="fas fa-exclamation-triangle"></i> ' + title :
        '<i class="fas fa-info-circle"></i> ' + title;
    
    // Support HTML content
    if (body.includes('<')) {
        bodyEl.innerHTML = body;
    } else {
        bodyEl.textContent = body;
    }
    
    modal.style.display = 'flex';
}

// Show loading
function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

// Refresh data
function refreshData() {
    loadPendingRegistrations();
    loadSystemOverview();
}

// ─── REVIEWS ──────────────────────────────────────────────────────────────────
async function loadReviews() {
    const container = document.getElementById('reviews-list');
    container.innerHTML = '<p style="color:#64748b;padding:20px;">Loading reviews...</p>';
    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${ADMIN_API}/admin/reviews`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const reviews = data.reviews || [];
        if (reviews.length === 0) {
            container.innerHTML = '<p style="color:#64748b;padding:20px;">No reviews yet.</p>';
            return;
        }
        container.innerHTML = reviews.map(r => `
            <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div>
                        <strong style="color:#1e293b;">${r.bookingId}</strong>
                        <span style="margin-left:12px;color:#64748b;font-size:13px;">${new Date(r.feedback.submittedAt).toLocaleString('en-IN')}</span>
                    </div>
                    <div style="font-size:1.4rem;">${'★'.repeat(r.feedback.rating)}${'☆'.repeat(5 - r.feedback.rating)}</div>
                </div>
                <div style="display:flex;gap:24px;font-size:13px;color:#64748b;margin-bottom:8px;">
                    <span>👤 ${r.patientInfo?.name || 'Unknown'}</span>
                    <span>🚑 Driver: ${r.driverId?.name || 'N/A'} (${r.driverId?.phone || ''})</span>
                    <span>📍 ${r.location?.pickup?.address || 'N/A'}</span>
                    <span>🏥 ${r.location?.destination?.hospitalId?.hospitalName || 'N/A'}</span>
                </div>
                ${r.feedback.comment ? `<p style="color:#374151;background:#f8fafc;padding:10px;border-radius:8px;margin:0;">"${r.feedback.comment}"</p>` : ''}
            </div>
        `).join('');
    } catch(e) {
        container.innerHTML = '<p style="color:#dc2626;padding:20px;">Failed to load reviews.</p>';
    }
}

// Logout
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'entry.html';
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

async function loadAnalytics(period, btnEl) {
    // Update active button
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    document.getElementById('analytics-loading').style.display = 'block';
    document.getElementById('analytics-content').style.display = 'none';

    try {
        const token = localStorage.getItem('authToken');
        const [analyticsRes, bookingsRes] = await Promise.all([
            fetch(`${ADMIN_API}/admin/analytics?period=${period}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`${ADMIN_API}/admin/dashboard`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        const analyticsData = await analyticsRes.json();
        const dashData = await bookingsRes.json();

        renderAnalytics(analyticsData.analytics, dashData, period);

    } catch (err) {
        console.error('Analytics error:', err);
    } finally {
        document.getElementById('analytics-loading').style.display = 'none';
        document.getElementById('analytics-content').style.display = 'block';
    }
}

function renderAnalytics(analytics, dashData, period) {
    const trends = analytics.bookingTrends || [];
    const peakHours = analytics.peakHours || [];
    const responseTimes = analytics.responseTimeAnalytics || [];

    // Summary pills
    const total = trends.reduce((s, t) => s + t.count, 0);
    const completed = trends.reduce((s, t) => s + (t.completed || 0), 0);
    const cancelled = trends.reduce((s, t) => s + (t.cancelled || 0), 0);
    document.getElementById('an-total').textContent = total;
    document.getElementById('an-completed').textContent = completed;
    document.getElementById('an-cancelled').textContent = cancelled;

    // Bookings over time bar chart
    const bookingsChart = document.getElementById('bookings-chart');
    if (trends.length === 0) {
        bookingsChart.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px;">No data for this period</p>';
    } else {
        const maxCount = Math.max(...trends.map(t => t.count), 1);
        bookingsChart.innerHTML = trends.slice(-10).map(t => {
            const pct = Math.round((t.count / maxCount) * 100);
            const label = t._id.length > 10 ? t._id.slice(5) : t._id; // trim year
            return `
                <div class="chart-bar-row">
                    <div class="chart-bar-label">${label}</div>
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,#dc2626,#f87171)">
                            <span class="chart-bar-val">${t.count}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Peak hours heatmap (24 cells)
    const peakMap = {};
    peakHours.forEach(p => { peakMap[p._id] = p.count; });
    const maxPeak = Math.max(...Object.values(peakMap), 1);
    const peakGrid = document.getElementById('peak-hours-chart');
    peakGrid.innerHTML = Array.from({ length: 24 }, (_, h) => {
        const count = peakMap[h] || 0;
        const intensity = count / maxPeak;
        let bg = '#f1f5f9';
        if (intensity > 0.66) bg = '#dc2626';
        else if (intensity > 0.33) bg = '#fca5a5';
        else if (intensity > 0) bg = '#fee2e2';
        const label = h < 12 ? `${h || 12}${h < 12 ? 'am' : 'pm'}` : `${h === 12 ? 12 : h - 12}pm`;
        return `<div class="peak-cell" style="background:${bg}" title="${label}: ${count} bookings">${h}h</div>`;
    }).join('');

    // Incident types from recent bookings
    const recentBookings = dashData.recentBookings || [];
    const incidentMap = {};
    recentBookings.forEach(b => {
        const type = b.emergencyDetails?.description || 'Other';
        incidentMap[type] = (incidentMap[type] || 0) + 1;
    });
    const incidentChart = document.getElementById('incident-chart');
    const incidentEntries = Object.entries(incidentMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (incidentEntries.length === 0) {
        incidentChart.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px;">No recent bookings</p>';
    } else {
        incidentChart.innerHTML = incidentEntries.map(([name, count]) => `
            <div class="incident-row">
                <span class="incident-name">🚨 ${name}</span>
                <span class="incident-count">${count}</span>
            </div>
        `).join('');
    }

    // Response time by severity
    const responseChart = document.getElementById('response-chart');
    if (responseTimes.length === 0) {
        responseChart.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px;">No completed trips with response data</p>';
    } else {
        const maxRT = Math.max(...responseTimes.map(r => r.avgResponseTime || 0), 1);
        const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#7c3aed'];
        responseChart.innerHTML = responseTimes.map((r, i) => {
            const avg = r.avgResponseTime ? r.avgResponseTime.toFixed(1) : '0';
            const pct = Math.round(((r.avgResponseTime || 0) / maxRT) * 100);
            return `
                <div class="chart-bar-row">
                    <div class="chart-bar-label">Severity ${r._id || 'N/A'}</div>
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill" style="width:${pct}%;background:${colors[i % colors.length]}">
                            <span class="chart-bar-val">${avg}m</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}
