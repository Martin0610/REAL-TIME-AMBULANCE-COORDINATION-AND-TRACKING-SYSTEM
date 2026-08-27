// Utility functions
const Utils = {
    // Show loading overlay
    showLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    },

    // Hide loading overlay
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },

    // Show success modal
    showSuccess(message, details = '') {
        const modal = document.getElementById('success-modal');
        const body = document.getElementById('success-modal-body');
        
        if (modal && body) {
            body.innerHTML = `
                <p><strong>${message}</strong></p>
                ${details ? `<div class="mt-20">${details}</div>` : ''}
            `;
            modal.style.display = 'flex';
        }
    },

    // Show error modal
    showError(message, details = '') {
        const modal = document.getElementById('error-modal');
        const body = document.getElementById('error-modal-body');
        
        if (modal && body) {
            body.innerHTML = `
                <p><strong>${message}</strong></p>
                ${details ? `<div class="mt-20">${details}</div>` : ''}
            `;
            modal.style.display = 'flex';
        }
    },

    // Close modal
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    },

    // Format date and time
    formatDateTime(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Format time only
    formatTime(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Calculate time difference in minutes
    getTimeDifference(startTime, endTime = new Date()) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        return Math.floor((end - start) / (1000 * 60));
    },

    // Format duration in minutes to readable format
    formatDuration(minutes) {
        if (minutes < 60) {
            return `${minutes} min`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    },

    // Calculate distance between two coordinates (Haversine formula)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    // Convert degrees to radians
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    },

    // Format distance
    formatDistance(km) {
        if (km < 1) {
            return `${Math.round(km * 1000)} m`;
        }
        return `${km.toFixed(1)} km`;
    },

    // Validate phone number (Indian format)
    validatePhone(phone) {
        const phoneRegex = /^[6-9]\d{9}$/;
        return phoneRegex.test(phone);
    },

    // Validate email
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // Sanitize HTML to prevent XSS
    sanitizeHTML(str) {
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    },

    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Throttle function
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Generate random ID
    generateId() {
        return Math.random().toString(36).substr(2, 9);
    },

    // Get severity info
    getSeverityInfo(level) {
        return CONFIG.SEVERITY_LEVELS[level] || CONFIG.SEVERITY_LEVELS[3];
    },

    // Get booking status info
    getStatusInfo(status) {
        return CONFIG.BOOKING_STATUS[status] || CONFIG.BOOKING_STATUS.pending;
    },

    // Format booking ID for display
    formatBookingId(bookingId) {
        return bookingId.toUpperCase();
    },

    // Check if location is within service area
    isInServiceArea(lat, lng) {
        const bounds = CONFIG.CHENNAI_BOUNDS;
        return lat >= bounds.south && lat <= bounds.north && 
               lng >= bounds.west && lng <= bounds.east;
    },

    // Get nearest service area
    getNearestServiceArea(lat, lng) {
        let nearest = null;
        let minDistance = Infinity;

        Object.values(CONFIG.SERVICE_AREAS).forEach(area => {
            const distance = this.calculateDistance(lat, lng, area.lat, area.lng);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = area;
            }
        });

        return { area: nearest, distance: minDistance };
    },

    // Local storage helpers
    storage: {
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.error('Failed to save to localStorage:', e);
            }
        },

        get(key) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            } catch (e) {
                console.error('Failed to read from localStorage:', e);
                return null;
            }
        },

        remove(key) {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                console.error('Failed to remove from localStorage:', e);
            }
        },

        clear() {
            try {
                localStorage.clear();
            } catch (e) {
                console.error('Failed to clear localStorage:', e);
            }
        }
    },

    // Session storage helpers
    session: {
        set(key, value) {
            try {
                sessionStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.error('Failed to save to sessionStorage:', e);
            }
        },

        get(key) {
            try {
                const item = sessionStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            } catch (e) {
                console.error('Failed to read from sessionStorage:', e);
                return null;
            }
        },

        remove(key) {
            try {
                sessionStorage.removeItem(key);
            } catch (e) {
                console.error('Failed to remove from sessionStorage:', e);
            }
        }
    },

    // Copy text to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (e) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    },

    // Show toast notification
    showToast(message, type = 'info', duration = 3000) {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

        // Add styles if not already added
        if (!document.getElementById('toast-styles')) {
            const styles = document.createElement('style');
            styles.id = 'toast-styles';
            styles.textContent = `
                .toast {
                    position: fixed;
                    top: 100px;
                    right: 20px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    padding: 15px 20px;
                    z-index: 10000;
                    transform: translateX(400px);
                    transition: transform 0.3s ease;
                    max-width: 350px;
                }
                .toast.show { transform: translateX(0); }
                .toast-content { display: flex; align-items: center; gap: 10px; }
                .toast-success { border-left: 4px solid #059669; }
                .toast-error { border-left: 4px solid #dc2626; }
                .toast-info { border-left: 4px solid #2563eb; }
                .toast-success i { color: #059669; }
                .toast-error i { color: #dc2626; }
                .toast-info i { color: #2563eb; }
            `;
            document.head.appendChild(styles);
        }

        // Add to DOM and show
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);

        // Remove after duration
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => document.body.removeChild(toast), 300);
        }, duration);
    }
};

// Make closeModal globally available
window.closeModal = Utils.closeModal;