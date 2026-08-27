// Authentication service
const AuthService = {
    currentUser: null,

    // Initialize authentication service
    init() {
        this.setupLoginTabs();
        this.setupLoginForms();
        this.checkAuthStatus();
    },

    // Setup login tabs
    setupLoginTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const loginForms = document.querySelectorAll('.login-form');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Update active tab
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update active form
                loginForms.forEach(form => form.classList.remove('active'));
                const targetForm = document.getElementById(`${targetTab}-login`);
                if (targetForm) {
                    targetForm.classList.add('active');
                }
            });
        });
    },

    // Setup login forms
    setupLoginForms() {
        // Driver login
        const driverForm = document.getElementById('driver-login');
        if (driverForm) {
            driverForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin('driver', {
                    email: document.getElementById('driver-email').value,
                    password: document.getElementById('driver-password').value
                });
            });
        }

        // Hospital login
        const hospitalForm = document.getElementById('hospital-login');
        if (hospitalForm) {
            hospitalForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin('hospital', {
                    email: document.getElementById('hospital-email').value,
                    password: document.getElementById('hospital-password').value
                });
            });
        }

        // Admin login
        const adminForm = document.getElementById('admin-login');
        if (adminForm) {
            adminForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin('admin', {
                    email: document.getElementById('admin-email').value,
                    password: document.getElementById('admin-password').value
                });
            });
        }
    },

    // Handle login
    async handleLogin(role, credentials) {
        try {
            Utils.showLoading();

            // Validate credentials
            if (!this.validateCredentials(credentials)) {
                Utils.hideLoading();
                Utils.showError('Please fill in all required fields');
                return;
            }

            // Attempt login
            const response = await API.auth.login({
                ...credentials,
                role
            });

            Utils.hideLoading();

            // Store auth data
            API.setAuthToken(response.token);
            this.currentUser = response.user;
            Utils.storage.set('currentUser', response.user);

            // If driver, join driver room and start sharing if on duty
            try {
                if (response.user.role === 'driver') {
                    TrackingService.joinRoom(`driver-${response.user.id}`);
                    if (response.user.isOnDuty) {
                        TrackingService.startDriverLocationSharing();
                    }
                }
            } catch (err) {
                console.error('Error initializing driver tracking after login:', err);
            }

            // Show success message
            Utils.showSuccess(
                'Login Successful!',
                `Welcome back, ${response.user.name}. Redirecting to your dashboard...`
            );

            // Redirect to appropriate dashboard
            setTimeout(() => {
                Utils.closeModal('success-modal');
                this.redirectToDashboard(role);
            }, 2000);

        } catch (error) {
            Utils.hideLoading();
            console.error('Login error:', error);
            Utils.showError('Login Failed', error.message || 'Please check your credentials and try again.');
        }
    },

    // Validate login credentials
    validateCredentials(credentials) {
        if (!credentials.email || !Utils.validateEmail(credentials.email)) {
            return false;
        }
        if (!credentials.password || credentials.password.length < 6) {
            return false;
        }
        return true;
    },

    // Redirect to appropriate dashboard
    redirectToDashboard(role) {
        const dashboardUrls = {
            driver: 'driver-dashboard.html',
            hospital: 'hospital-dashboard.html',
            admin: 'admin-dashboard.html'
        };

        const url = dashboardUrls[role];
        if (url) {
            window.location.href = url;
        } else {
            console.error('Unknown role:', role);
            Utils.showError('Unknown user role');
        }
    },

    // Check authentication status
    checkAuthStatus() {
        const token = API.getAuthToken();
        const user = Utils.storage.get('currentUser');

        if (token && user) {
            this.currentUser = user;
            this.updateNavigation(true);
        } else {
            this.updateNavigation(false);
        }
    },

    // Update navigation based on auth status
    updateNavigation(isAuthenticated) {
        const navMenu = document.getElementById('nav-menu');
        if (!navMenu) return;

        if (isAuthenticated && this.currentUser) {
            // Add user menu
            const userMenu = document.createElement('div');
            userMenu.className = 'user-menu';
            userMenu.innerHTML = `
                <div class="user-info">
                    <span class="user-name">${this.currentUser.name}</span>
                    <span class="user-role">${this.currentUser.role}</span>
                </div>
                <div class="user-actions">
                    <a href="${this.getDashboardUrl()}" class="nav-link">Dashboard</a>
                    <button onclick="AuthService.logout()" class="nav-link logout-btn">Logout</button>
                </div>
            `;
            
            // Replace login link with user menu
            const loginLink = navMenu.querySelector('a[href="#login"]');
            if (loginLink) {
                loginLink.replaceWith(userMenu);
            }
        }
    },

    // Get dashboard URL for current user
    getDashboardUrl() {
        if (!this.currentUser) return '#';
        
        const dashboardUrls = {
            driver: 'driver-dashboard.html',
            hospital: 'hospital-dashboard.html',
            admin: 'admin-dashboard.html'
        };
        
        return dashboardUrls[this.currentUser.role] || '#';
    },

    // Logout
    async logout() {
        try {
            // Clear auth data
            API.removeAuthToken();
            Utils.storage.remove('currentUser');
            this.currentUser = null;

            // Stop location sharing and disconnect socket if connected
            try {
                TrackingService.stopDriverLocationSharing();
            } catch (err) {
                console.error('Error stopping driver location sharing:', err);
            }

            if (TrackingService.socket) {
                TrackingService.disconnect();
            }

            // Show success message
            Utils.showToast('Logged out successfully', 'success');

            // Redirect to home page
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);

        } catch (error) {
            console.error('Logout error:', error);
            Utils.showError('Logout failed', error.message);
        }
    },

    // Register driver (for admin use)
    async registerDriver(driverData) {
        try {
            Utils.showLoading();
            
            const response = await API.auth.registerDriver(driverData);
            
            Utils.hideLoading();
            Utils.showSuccess('Driver registered successfully!');
            
            return response;
        } catch (error) {
            Utils.hideLoading();
            console.error('Driver registration error:', error);
            Utils.showError('Registration failed', error.message);
            throw error;
        }
    },

    // Register hospital (for admin use)
    async registerHospital(hospitalData) {
        try {
            Utils.showLoading();
            
            const response = await API.auth.registerHospital(hospitalData);
            
            Utils.hideLoading();
            Utils.showSuccess('Hospital registered successfully!');
            
            return response;
        } catch (error) {
            Utils.hideLoading();
            console.error('Hospital registration error:', error);
            Utils.showError('Registration failed', error.message);
            throw error;
        }
    },

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    },

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.currentUser && !!API.getAuthToken();
    },

    // Check if user has specific role
    hasRole(role) {
        return this.currentUser && this.currentUser.role === role;
    },

    // Require authentication
    requireAuth(redirectUrl = 'index.html#login') {
        if (!this.isAuthenticated()) {
            Utils.showError('Please login to access this page');
            setTimeout(() => {
                window.location.href = redirectUrl;
            }, 2000);
            return false;
        }
        return true;
    },

    // Require specific role
    requireRole(role, redirectUrl = 'index.html') {
        if (!this.requireAuth()) return false;
        
        if (!this.hasRole(role)) {
            Utils.showError('Access denied. Insufficient permissions.');
            setTimeout(() => {
                window.location.href = redirectUrl;
            }, 2000);
            return false;
        }
        return true;
    },

    // Update duty status (for drivers)
    async updateDutyStatus(isOnDuty) {
        try {
            if (!this.hasRole('driver')) {
                throw new Error('Only drivers can update duty status');
            }

            const response = await API.auth.updateDutyStatus(isOnDuty);
            
            // Update current user data
            this.currentUser = response.user;
            Utils.storage.set('currentUser', response.user);

            // Start/stop driver location sharing based on duty
            try {
                if (response.user.isOnDuty) {
                    TrackingService.startDriverLocationSharing();
                } else {
                    TrackingService.stopDriverLocationSharing();
                }
            } catch (err) {
                console.error('Error toggling location sharing on duty change:', err);
            }
            
            Utils.showToast(
                `Duty status updated: ${isOnDuty ? 'On Duty' : 'Off Duty'}`,
                'success'
            );
            
            return response;
        } catch (error) {
            console.error('Update duty status error:', error);
            Utils.showError('Failed to update duty status', error.message);
            throw error;
        }
    },

    // Refresh user data
    async refreshUserData() {
        try {
            if (!this.isAuthenticated()) return null;
            
            const response = await API.auth.getCurrentUser();
            this.currentUser = response.user;
            Utils.storage.set('currentUser', response.user);
            
            return response.user;
        } catch (error) {
            console.error('Refresh user data error:', error);
            // If token is invalid, logout
            if (error.message.includes('401') || error.message.includes('403')) {
                await this.logout();
            }
            throw error;
        }
    }
};