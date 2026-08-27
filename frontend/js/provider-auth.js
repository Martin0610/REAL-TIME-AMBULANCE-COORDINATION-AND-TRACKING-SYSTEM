// Provider Authentication Handler
let currentRole = 'driver';
let currentTab = 'login';

document.addEventListener('DOMContentLoaded', function() {
    initializeProviderAuth();
});

function initializeProviderAuth() {
    setupTabs();
    setupRoleButtons();
    setupForms();
}

// Setup tab switching
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-tab') === tabName) {
            tab.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-content`).classList.add('active');
}

// Setup role button switching
function setupRoleButtons() {
    const roleButtons = document.querySelectorAll('.role-btn');
    roleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.getAttribute('data-role');
            switchRole(role);
        });
    });
}

function switchRole(role) {
    currentRole = role;
    
    // Update role buttons in current tab
    const activeTabContent = document.querySelector('.tab-content.active');
    activeTabContent.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-role') === role) {
            btn.classList.add('active');
        }
    });
    
    // Update login title
    if (currentTab === 'login') {
        const title = document.getElementById('login-title');
        const titles = {
            'driver': 'Driver Login',
            'hospital': 'Hospital Login',
            'admin': 'Admin Login'
        };
        title.textContent = titles[role] || 'Login';
    }
    
    // Update registration forms
    if (currentTab === 'register') {
        document.querySelectorAll('.provider-form').forEach(form => {
            form.classList.remove('active-form');
        });
        
        if (role === 'driver') {
            document.getElementById('driver-register-form').classList.add('active-form');
        } else if (role === 'hospital') {
            document.getElementById('hospital-register-form').classList.add('active-form');
        }
        // Admin cannot register from here
    }
}

// Setup form submissions
function setupForms() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // Driver registration
    document.getElementById('driver-register-form').addEventListener('submit', handleDriverRegistration);
    
    // Hospital registration
    document.getElementById('hospital-register-form').addEventListener('submit', handleHospitalRegistration);
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showMessage('error', 'Please fill in all fields');
        return;
    }

    const apiURL = `${getAPIBase()}/auth/login`;
    
    showLoading(true);
    
    try {
        const response = await fetch(apiURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role: currentRole })
        });
        
        const data = await response.json();
        showLoading(false);
        
        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            showMessage('success', 'Login successful! Redirecting...');
            setTimeout(() => {
                if (currentRole === 'driver') {
                    window.location.href = 'driver-dashboard.html';
                } else if (currentRole === 'hospital') {
                    window.location.href = 'hospital-dashboard.html';
                } else if (currentRole === 'admin') {
                    window.location.href = 'admin-dashboard.html';
                }
            }, 1500);
        } else {
            showMessage('error', data.error || 'Login failed. Please check your credentials.');
        }
    } catch (error) {
        showLoading(false);
        showMessage('error', 'Cannot reach server at: ' + apiURL + ' — Error: ' + error.message);
    }
}

// Handle driver registration
async function handleDriverRegistration(e) {
    e.preventDefault();
    
    const name = document.getElementById('driver-name').value;
    const phone = document.getElementById('driver-phone').value;
    const email = document.getElementById('driver-email').value;
    const license = document.getElementById('driver-license').value;
    const password = document.getElementById('driver-password').value;
    const confirmPassword = document.getElementById('driver-confirm-password').value;
    
    // Validation
    if (!name || !phone || !email || !license || !password || !confirmPassword) {
        showMessage('Error', 'Please fill in all required fields', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage('Error', 'Passwords do not match', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('Error', 'Password must be at least 6 characters', 'error');
        return;
    }
    
    if (phone.length !== 10) {
        showMessage('Error', 'Please enter a valid 10-digit phone number', 'error');
        return;
    }
    
    // File upload is optional - admin can request documents later if needed
    // if (driverFiles.length === 0) {
    //     showMessage('Error', 'Please upload at least one document', 'error');
    //     return;
    // }
    
    // Create FormData
    const formData = new FormData();
    formData.append('name', name);
    formData.append('phone', phone);
    formData.append('email', email);
    formData.append('licenseNumber', license);
    formData.append('password', password);
    formData.append('role', 'driver');
    
    // Debug: Log all form data
    console.log('Driver Registration Data:', {
        name, phone, email, license, password: '***'
    });
    
    // Send OTP for email verification
    sendOTPEmail(email, 'driver', formData);
}

// Handle hospital registration
async function handleHospitalRegistration(e) {
    e.preventDefault();
    
    const name = document.getElementById('hospital-name').value;
    const email = document.getElementById('hospital-email').value;
    const phone = document.getElementById('hospital-phone').value;
    const address = document.getElementById('hospital-address').value;
    const capacity = document.getElementById('hospital-capacity').value;
    const password = document.getElementById('hospital-password').value;
    const confirmPassword = document.getElementById('hospital-confirm-password').value;
    
    // Get selected facilities
    const facilities = [];
    document.querySelectorAll('input[name="facilities"]:checked').forEach(checkbox => {
        facilities.push(checkbox.value);
    });
    
    // Validation
    if (!name || !email || !phone || !address || !capacity || !password || !confirmPassword) {
        showMessage('Error', 'Please fill in all required fields', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage('Error', 'Passwords do not match', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('Error', 'Password must be at least 6 characters', 'error');
        return;
    }
    
    if (phone.length !== 10) {
        showMessage('Error', 'Please enter a valid 10-digit phone number', 'error');
        return;
    }
    
    if (facilities.length === 0) {
        showMessage('Error', 'Please select at least one facility', 'error');
        return;
    }
    
    // File upload is optional - admin can request documents later if needed
    // if (hospitalFiles.length === 0) {
    //     showMessage('Error', 'Please upload at least one document', 'error');
    //     return;
    // }
    
    // Create FormData
    const formData = new FormData();
    formData.append('hospitalName', name);
    formData.append('email', email);
    formData.append('phone', phone);
    formData.append('hospitalAddress', address);
    formData.append('capacity', capacity);
    formData.append('specialties', JSON.stringify(facilities));
    formData.append('password', password);
    formData.append('role', 'hospital');
    
    // Send OTP for email verification
    sendOTPEmail(email, 'hospital', formData);
}

// Show loading overlay
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = show ? 'flex' : 'none';
}

// Show message modal
function showMessage(type, message, messageType) {
    const modal = document.getElementById('message-modal');
    const header = document.getElementById('modal-header');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    
    // Support both old (type, message) and new (title, message, type) signatures
    let actualType = messageType || type;
    let actualMessage = messageType ? message : message;
    let actualTitle = messageType ? type : (type === 'success' ? 'Success' : 'Error');
    
    header.className = `modal-header ${actualType}`;
    
    if (actualType === 'success') {
        title.innerHTML = `<i class="fas fa-check-circle"></i> ${actualTitle}`;
    } else {
        title.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${actualTitle}`;
    }
    
    body.innerHTML = actualMessage;
    modal.style.display = 'flex';
}

// Close modal
function closeModal() {
    document.getElementById('message-modal').style.display = 'none';
}


// Password visibility toggle function
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.parentElement.querySelector('.toggle-password');
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}


// API Configuration — works on localhost, mobile network, and production
function getAPIBase() {
    if (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) return CONFIG.API_BASE_URL;
    if (window.__BACKEND_URL__) return `${window.__BACKEND_URL__.replace(/\/$/, '')}/api`;
    const host = window.location.hostname;
    if ((host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host)) && window.location.port !== '5001') {
        return `http://${host}:5001/api`;
    }
    return `${window.location.origin}/api`;
}

// File Upload Handling
let driverFiles = [];
let hospitalFiles = [];
let currentOTP = null;
let otpTimer = null;
let pendingRegistrationData = null;

function handleDriverFileUpload(files) {
    handleFileUpload(files, 'driver');
}

function handleHospitalFileUpload(files) {
    handleFileUpload(files, 'hospital');
}

function handleFileUpload(files, role) {
    const fileList = role === 'driver' ? driverFiles : hospitalFiles;
    const listElement = document.getElementById(`${role}-file-list`);
    
    Array.from(files).forEach(file => {
        // Validate file
        if (!validateFile(file)) return;
        
        // Add to array
        fileList.push(file);
        
        // Display file
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-item-info">
                <div class="file-icon">
                    <i class="fas fa-file-${getFileIcon(file.type)}"></i>
                </div>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button type="button" class="file-remove" onclick="removeFile('${file.name}', '${role}')">
                <i class="fas fa-times"></i>
            </button>
        `;
        listElement.appendChild(fileItem);
    });
    
    // Update the files array reference
    if (role === 'driver') {
        driverFiles = fileList;
    } else {
        hospitalFiles = fileList;
    }
}

function validateFile(file) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    
    if (!allowedTypes.includes(file.type)) {
        showMessage('Error', `File type not allowed: ${file.name}<br>Allowed: JPG, PNG, PDF`, 'error');
        return false;
    }
    
    if (file.size > maxSize) {
        showMessage('Error', `File too large: ${file.name}<br>Max size: 5MB`, 'error');
        return false;
    }
    
    return true;
}

function removeFile(fileName, role) {
    if (role === 'driver') {
        driverFiles = driverFiles.filter(f => f.name !== fileName);
    } else {
        hospitalFiles = hospitalFiles.filter(f => f.name !== fileName);
    }
    
    // Remove from display
    const listElement = document.getElementById(`${role}-file-list`);
    const fileItems = listElement.querySelectorAll('.file-item');
    fileItems.forEach(item => {
        if (item.querySelector('.file-name').textContent === fileName) {
            item.remove();
        }
    });
}

function getFileIcon(type) {
    if (type.includes('pdf')) return 'pdf';
    if (type.includes('image')) return 'image';
    return 'alt';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// OTP Functions
function sendOTPEmail(email, role, formData) {
    // Generate 6-digit OTP
    currentOTP = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store form data for later submission
    pendingRegistrationData = { role, formData };
    
    // Show OTP modal
    document.getElementById('otp-email-display').textContent = email;
    document.getElementById('otp-modal').classList.add('active');
    document.getElementById('otp1').focus();
    
    // Start timer
    startOTPTimer();
    
    // Send OTP via backend
    fetch(`${getAPIBase()}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: currentOTP })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('OTP sent successfully');
            // For testing, show OTP in console
            console.log('OTP for testing:', currentOTP);
        } else {
            showMessage('Error', 'Failed to send OTP. Please try again.', 'error');
        }
    })
    .catch(error => {
        console.error('Send OTP error:', error);
        // For testing, still allow to proceed
        console.log('OTP for testing:', currentOTP);
    });
}

function startOTPTimer() {
    let timeLeft = 60;
    const timerSpan = document.getElementById('otp-timer');
    const resendBtn = document.getElementById('resend-otp-btn');
    
    resendBtn.disabled = true;
    
    otpTimer = setInterval(() => {
        timeLeft--;
        timerSpan.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(otpTimer);
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend OTP';
        }
    }, 1000);
}

function moveToNextOTP(current, index) {
    if (current.value.length === 1 && index < 6) {
        document.getElementById(`otp${index + 1}`).focus();
    }
}

function resendOTP() {
    if (pendingRegistrationData) {
        const email = pendingRegistrationData.formData.get('email');
        sendOTPEmail(email, pendingRegistrationData.role, pendingRegistrationData.formData);
    }
}

function closeOTPModal() {
    document.getElementById('otp-modal').classList.remove('active');
    clearInterval(otpTimer);
    // Clear OTP inputs
    for (let i = 1; i <= 6; i++) {
        document.getElementById(`otp${i}`).value = '';
    }
}

function verifyOTPAndSubmit() {
    // Get entered OTP
    let enteredOTP = '';
    for (let i = 1; i <= 6; i++) {
        enteredOTP += document.getElementById(`otp${i}`).value;
    }
    
    if (enteredOTP.length !== 6) {
        showMessage('Error', 'Please enter complete OTP', 'error');
        return;
    }
    
    // Verify OTP
    if (enteredOTP === currentOTP) {
        closeOTPModal();
        // Proceed with registration
        submitRegistrationWithFiles(pendingRegistrationData.role, pendingRegistrationData.formData);
    } else {
        showMessage('Error', 'Invalid OTP. Please try again.', 'error');
        // Clear OTP inputs
        for (let i = 1; i <= 6; i++) {
            document.getElementById(`otp${i}`).value = '';
        }
        document.getElementById('otp1').focus();
    }
}

async function submitRegistrationWithFiles(role, formData) {
    showLoading(true);
    
    try {
        const files = role === 'driver' ? driverFiles : hospitalFiles;
        
        // Determine correct endpoint based on role
        const endpoint = role === 'driver' 
            ? `${getAPIBase()}/auth/register/driver-request`
            : `${getAPIBase()}/auth/register/hospital-request`;
        
        let response, data;
        
        // If no files, send as JSON instead of FormData
        if (files.length === 0) {
            // Convert FormData to JSON object
            const jsonData = {};
            for (let pair of formData.entries()) {
                jsonData[pair[0]] = pair[1];
            }
            
            console.log('=== Submitting Registration (JSON) ===');
            console.log('Role:', role);
            console.log('Data:', { ...jsonData, password: '***' });
            console.log('Endpoint:', endpoint);
            
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(jsonData)
            });
        } else {
            // If files exist, send as FormData (requires multer on backend)
            files.forEach((file, index) => {
                formData.append(`documents`, file);
            });
            
            console.log('=== Submitting Registration (FormData with files) ===');
            console.log('Role:', role);
            console.log('Files:', files.length);
            console.log('Endpoint:', endpoint);
            
            response = await fetch(endpoint, {
                method: 'POST',
                body: formData
            });
        }
        
        data = await response.json();
        showLoading(false);
        
        console.log('Registration response:', data);
        
        if (response.ok) {
            showMessage('Success', 
                `Registration submitted successfully!<br><br>
                Your application is under review.<br>
                You'll receive an email once approved.<br><br>
                <strong>Email:</strong> ${data.email || formData.get('email')}`, 
                'success'
            );
            
            // Reset form and files
            if (role === 'driver') {
                document.getElementById('driver-register-form').reset();
                driverFiles = [];
                document.getElementById('driver-file-list').innerHTML = '';
            } else {
                document.getElementById('hospital-register-form').reset();
                hospitalFiles = [];
                document.getElementById('hospital-file-list').innerHTML = '';
            }
            
            // Switch to login tab after 3 seconds
            setTimeout(() => {
                switchTab('login');
            }, 3000);
        } else {
            showMessage('Error', data.error || 'Registration failed. Please try again.', 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('Registration error:', error);
        showMessage('Error', 'Registration failed. Please try again.', 'error');
    }
}
