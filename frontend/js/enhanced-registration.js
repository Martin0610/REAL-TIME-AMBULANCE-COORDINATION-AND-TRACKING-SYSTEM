// Enhanced Registration Handler
let currentStep = 1;
let totalSteps = 4;
let uploadedFiles = [];
let otpTimer = null;
let otpTimeLeft = 60;
let generatedOTP = null;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    updateStepDisplay();
});

// Step Navigation
function nextStep() {
    if (validateCurrentStep()) {
        if (currentStep === 1) {
            // Skip OTP step and go directly to document upload
            moveToStep(3);
        } else if (currentStep === 3) {
            moveToStep(4);
            populateReview();
        } else if (currentStep === 4) {
            // Submit registration
            submitRegistration();
        }
    }
}

function previousStep() {
    if (currentStep === 3) {
        moveToStep(1);
    } else if (currentStep > 1) {
        moveToStep(currentStep - 1);
    }
}

function moveToStep(step) {
    currentStep = step;
    updateStepDisplay();
}

function updateStepDisplay() {
    // Update progress steps
    document.querySelectorAll('.step').forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.remove('active', 'completed');
        
        if (stepNum < currentStep) {
            step.classList.add('completed');
            step.querySelector('.step-number').innerHTML = '✓';
        } else if (stepNum === currentStep) {
            step.classList.add('active');
            step.querySelector('.step-number').textContent = stepNum;
        } else {
            step.querySelector('.step-number').textContent = stepNum;
        }
    });

    // Update form steps
    document.querySelectorAll('.form-step').forEach((step, index) => {
        step.classList.remove('active');
        if (index + 1 === currentStep) {
            step.classList.add('active');
        }
    });

    // Update buttons
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const formActions = document.getElementById('formActions');

    if (currentStep === 1) {
        prevBtn.style.display = 'none';
        nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
    } else if (currentStep === 4) {
        prevBtn.style.display = 'inline-block';
        nextBtn.innerHTML = '<i class="fas fa-check"></i> Submit Registration';
    } else if (currentStep === 5) {
        formActions.style.display = 'none';
    } else {
        prevBtn.style.display = 'inline-block';
        nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
    }
}

// Validation
function validateCurrentStep() {
    if (currentStep === 1) {
        const fullName = document.getElementById('fullName').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const role = document.getElementById('role').value;

        if (!fullName || !email || !phone || !password || !confirmPassword || !role) {
            alert('Please fill in all required fields');
            return false;
        }

        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return false;
        }

        if (password.length < 6) {
            alert('Password must be at least 6 characters long');
            return false;
        }

        if (!/^[0-9]{10}$/.test(phone)) {
            alert('Please enter a valid 10-digit phone number');
            return false;
        }

        // Role-specific validation
        if (role === 'driver') {
            const licenseNumber = document.getElementById('licenseNumber').value.trim();
            if (!licenseNumber) {
                alert('Please enter your driving license number');
                return false;
            }
        } else if (role === 'hospital') {
            const hospitalName = document.getElementById('hospitalName').value.trim();
            const hospitalAddress = document.getElementById('hospitalAddress').value.trim();
            if (!hospitalName || !hospitalAddress) {
                alert('Please fill in hospital details');
                return false;
            }
        }

        return true;
    }

    if (currentStep === 4) {
        const termsCheckbox = document.getElementById('termsCheckbox');
        const privacyCheckbox = document.getElementById('privacyCheckbox');

        if (!termsCheckbox.checked || !privacyCheckbox.checked) {
            alert('Please accept the Terms & Conditions and Privacy Policy');
            return false;
        }

        return true;
    }

    return true;
}

// Update form fields based on role
function updateFormFields() {
    const role = document.getElementById('role').value;
    const driverFields = document.getElementById('driverFields');
    const hospitalFields = document.getElementById('hospitalFields');

    if (role === 'driver') {
        driverFields.style.display = 'block';
        hospitalFields.style.display = 'none';
        updateRequiredDocs('driver');
    } else if (role === 'hospital') {
        driverFields.style.display = 'none';
        hospitalFields.style.display = 'block';
        updateRequiredDocs('hospital');
    } else {
        driverFields.style.display = 'none';
        hospitalFields.style.display = 'none';
    }
}

function updateRequiredDocs(role) {
    const requiredDocs = document.getElementById('requiredDocs');
    
    if (role === 'driver') {
        requiredDocs.innerHTML = `
            <li>Driving License (Front & Back)</li>
            <li>Aadhaar Card / ID Proof</li>
            <li>Profile Photo</li>
            <li>Medical Fitness Certificate (Optional)</li>
        `;
    } else if (role === 'hospital') {
        requiredDocs.innerHTML = `
            <li>Hospital Registration Certificate</li>
            <li>Medical Council Registration</li>
            <li>Staff ID Card</li>
            <li>Hospital Photos (Exterior/Interior)</li>
        `;
    }
}

// Password Strength Checker
function checkPasswordStrength() {
    const password = document.getElementById('password').value;
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');

    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    strengthBar.className = 'password-strength-bar';
    
    if (strength <= 2) {
        strengthBar.classList.add('strength-weak');
        strengthText.textContent = 'Weak password';
        strengthText.style.color = '#ef4444';
    } else if (strength <= 4) {
        strengthBar.classList.add('strength-medium');
        strengthText.textContent = 'Medium strength';
        strengthText.style.color = '#f59e0b';
    } else {
        strengthBar.classList.add('strength-strong');
        strengthText.textContent = 'Strong password';
        strengthText.style.color = '#10b981';
    }
}

// OTP Functions
function sendOTP() {
    const email = document.getElementById('email').value;
    document.getElementById('displayEmail').textContent = email;

    // Generate OTP (in real app, this would be done on backend)
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('Generated OTP:', generatedOTP); // For testing

    // In real app, send OTP via email API
    alert(`OTP sent to ${email}\n\nFor testing, OTP is: ${generatedOTP}`);

    moveToStep(2);
    startOTPTimer();
}

function startOTPTimer() {
    otpTimeLeft = 60;
    const resendBtn = document.getElementById('resendBtn');
    const timerSpan = document.getElementById('timer');
    
    resendBtn.disabled = true;
    
    otpTimer = setInterval(() => {
        otpTimeLeft--;
        timerSpan.textContent = otpTimeLeft;
        
        if (otpTimeLeft <= 0) {
            clearInterval(otpTimer);
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend OTP';
        }
    }, 1000);
}

function resendOTP() {
    sendOTP();
}

function moveToNext(current, index) {
    if (current.value.length === 1 && index < 6) {
        const nextInput = document.querySelectorAll('.otp-input')[index];
        if (nextInput) nextInput.focus();
    }
}

function verifyOTP() {
    const otpInputs = document.querySelectorAll('.otp-input');
    const enteredOTP = Array.from(otpInputs).map(input => input.value).join('');

    if (enteredOTP.length !== 6) {
        alert('Please enter complete OTP');
        return false;
    }

    // In real app, verify with backend
    if (enteredOTP === generatedOTP) {
        alert('Email verified successfully!');
        clearInterval(otpTimer);
        return true;
    } else {
        alert('Invalid OTP. Please try again.');
        otpInputs.forEach(input => input.value = '');
        otpInputs[0].focus();
        return false;
    }
}

// File Upload Functions
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadZone').classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadZone').classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadZone').classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    handleFiles(files);
}

function handleFiles(files) {
    const fileList = document.getElementById('fileList');
    
    Array.from(files).forEach(file => {
        // Validate file
        if (!validateFile(file)) return;
        
        // Add to uploaded files
        uploadedFiles.push(file);
        
        // Display file
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon">
                    <i class="fas fa-file-${getFileIcon(file.type)}"></i>
                </div>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button type="button" class="file-remove" onclick="removeFile('${file.name}')">
                <i class="fas fa-times"></i>
            </button>
        `;
        fileList.appendChild(fileItem);
    });
}

function validateFile(file) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    
    if (!allowedTypes.includes(file.type)) {
        alert(`File type not allowed: ${file.name}\nAllowed: JPG, PNG, PDF`);
        return false;
    }
    
    if (file.size > maxSize) {
        alert(`File too large: ${file.name}\nMax size: 5MB`);
        return false;
    }
    
    return true;
}

function removeFile(fileName) {
    uploadedFiles = uploadedFiles.filter(file => file.name !== fileName);
    
    // Remove from display
    const fileList = document.getElementById('fileList');
    const fileItems = fileList.querySelectorAll('.file-item');
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

// Review & Submit
function populateReview() {
    document.getElementById('reviewName').textContent = document.getElementById('fullName').value;
    document.getElementById('reviewEmail').textContent = document.getElementById('email').value;
    document.getElementById('reviewPhone').textContent = document.getElementById('phone').value;
    
    const role = document.getElementById('role').value;
    document.getElementById('reviewRole').textContent = role === 'driver' ? 'Ambulance Driver' : 'Hospital';
    
    // Display uploaded documents
    const reviewDocs = document.getElementById('reviewDocs');
    reviewDocs.innerHTML = uploadedFiles.map(file => `
        <p style="margin-bottom: 8px;">
            <i class="fas fa-check-circle" style="color: #10b981;"></i>
            ${file.name} (${formatFileSize(file.size)})
        </p>
    `).join('');
}

async function submitRegistration() {
    const role = document.getElementById('role').value;
    
    // Prepare data based on role
    const registrationData = {
        name: document.getElementById('fullName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        password: document.getElementById('password').value
    };
    
    if (role === 'driver') {
        registrationData.licenseNumber = document.getElementById('licenseNumber').value;
    } else if (role === 'hospital') {
        registrationData.hospitalName = document.getElementById('hospitalName').value;
        registrationData.hospitalAddress = document.getElementById('hospitalAddress').value;
        // Default values for required fields
        registrationData.capacity = 50;
        registrationData.specialties = ['Emergency Care', 'General Medicine'];
    }
    
    console.log('Submitting registration:', registrationData);
    
    try {
        // Show loading
        const nextBtn = document.getElementById('nextBtn');
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        
        // Determine endpoint based on role
        const endpoint = role === 'driver' 
            ? '/api/auth/register/driver-request'
            : '/api/auth/register/hospital-request';
        
        console.log('Sending request to:', `${CONFIG.API_BASE_URL}${endpoint}`);
        
        const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(registrationData)
        });
        
        console.log('Response status:', response.status);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }
        
        // Success - show confirmation
        const applicationId = 'REG-' + Date.now().toString(36).toUpperCase();
        document.getElementById('applicationId').textContent = applicationId;
        moveToStep(5);
        
    } catch (error) {
        console.error('Registration error:', error);
        
        // Show error in a modal
        showErrorModal(error.message || 'Registration failed. Please try again.');
        
        // Re-enable button
        const nextBtn = document.getElementById('nextBtn');
        nextBtn.disabled = false;
        nextBtn.innerHTML = '<i class="fas fa-check"></i> Submit Registration';
    }
}

// Show error modal
function showErrorModal(message) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('errorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'errorModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        modal.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 12px; max-width: 400px; text-align: center;">
                <div style="color: #ef4444; font-size: 48px; margin-bottom: 20px;">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3 style="margin-bottom: 15px; color: #1e293b;">Error</h3>
                <p id="errorMessage" style="color: #64748b; margin-bottom: 25px;"></p>
                <button onclick="closeErrorModal()" style="background: #3b82f6; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    OK
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    document.getElementById('errorMessage').textContent = message;
    modal.style.display = 'flex';
}

function closeErrorModal() {
    const modal = document.getElementById('errorModal');
    if (modal) {
        modal.style.display = 'none';
    }
}
