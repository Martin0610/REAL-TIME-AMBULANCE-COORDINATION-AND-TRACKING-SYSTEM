// Toast Notification System
// Calming notifications to keep patients informed

class ToastNotification {
    constructor() {
        this.container = document.getElementById('toast-container');
        this.toasts = [];
    }
    
    show(title, message, type = 'info', duration = 5000) {
        const toast = this.createToast(title, message, type);
        this.container.appendChild(toast);
        this.toasts.push(toast);
        
        // Auto-remove after duration
        setTimeout(() => {
            this.hide(toast);
        }, duration);
        
        return toast;
    }
    
    createToast(title, message, type) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✅',
            info: 'ℹ️',
            warning: '⚠️',
            calm: '💙'
        };
        
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="Close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Close button handler
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.hide(toast);
        });
        
        return toast;
    }
    
    hide(toast) {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            const index = this.toasts.indexOf(toast);
            if (index > -1) {
                this.toasts.splice(index, 1);
            }
        }, 400);
    }
    
    // Predefined calming messages
    bookingCreated() {
        this.show(
            'Booking Confirmed! 🚑',
            'Your ambulance request has been received. Help is on the way.',
            'success',
            6000
        );
    }
    
    ambulanceAssigned() {
        this.show(
            'Ambulance Assigned ✓',
            'An ambulance has been assigned to you. The driver will arrive soon.',
            'info',
            6000
        );
    }
    
    ambulanceAccepted() {
        this.show(
            'Driver Accepted 👍',
            'The driver has accepted your request and is preparing to come.',
            'calm',
            6000
        );
    }
    
    ambulanceEnRoute() {
        this.show(
            'Ambulance On The Way 🚑',
            'The ambulance is now traveling to your location. Stay calm.',
            'info',
            7000
        );
    }
    
    ambulanceArrived() {
        this.show(
            'Ambulance Arrived! 🎯',
            'The ambulance has reached your location. Help is here.',
            'success',
            7000
        );
    }
    
    patientPickedUp() {
        this.show(
            'Patient Picked Up ✓',
            'You are now being transported to the hospital safely.',
            'success',
            7000
        );
    }
    
    transporting() {
        this.show(
            'On The Way to Hospital 🏥',
            'The ambulance is taking you to the hospital. You\'re in good hands.',
            'calm',
            7000
        );
    }
    
    tripCompleted() {
        this.show(
            'Arrived at Hospital ✓',
            'You have safely arrived at the hospital. Medical staff will assist you.',
            'success',
            8000
        );
    }
    
    stayCalm() {
        this.show(
            'Stay Calm 💙',
            'Help is on the way. Take deep breaths and stay where you are.',
            'calm',
            6000
        );
    }
    
    helpAvailable() {
        this.show(
            'Emergency Guidance Available 💡',
            'Click the red button for first aid instructions while you wait.',
            'info',
            7000
        );
    }
}

// Initialize toast system
const toast = new ToastNotification();
window.toast = toast;

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToastNotification;
}
