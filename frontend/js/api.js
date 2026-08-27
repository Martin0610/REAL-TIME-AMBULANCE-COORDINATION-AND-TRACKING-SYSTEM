// API service for making HTTP requests
const API = {
    // Base configuration
    baseURL: CONFIG.API_BASE_URL,
    
    // Get auth token from storage
    getAuthToken() {
        return Utils.storage.get('authToken');
    },

    // Set auth token
    setAuthToken(token) {
        Utils.storage.set('authToken', token);
    },

    // Remove auth token
    removeAuthToken() {
        Utils.storage.remove('authToken');
    },

    // Make HTTP request
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const token = this.getAuthToken();

        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        // Add auth token if available
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, config);

            // Read as text first to avoid calling json() on empty or non-JSON responses
            const text = await response.text();
            let data = null;

            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    // Not a JSON response (may be HTML error page); keep text for debugging
                    console.warn('API response is not valid JSON:', text);
                    data = null;
                }
            }

            if (!response.ok) {
                const message = (data && data.error) ? data.error : `HTTP error! status: ${response.status}`;
                throw new Error(message);
            }

            // Return parsed data when available, otherwise an empty object
            return data !== null ? data : {};
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    },

    // GET request
    async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        
        return this.request(url, {
            method: 'GET'
        });
    },

    // POST request
    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    // PATCH request
    async patch(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    // DELETE request
    async delete(endpoint) {
        return this.request(endpoint, {
            method: 'DELETE'
        });
    },

    // Authentication endpoints
    auth: {
        async login(credentials) {
            return API.post('/auth/login', credentials);
        },

        async registerDriver(data) {
            return API.post('/auth/register/driver', data);
        },

        async registerHospital(data) {
            return API.post('/auth/register/hospital', data);
        },

        async getCurrentUser() {
            return API.get('/auth/me');
        },

        async updateDutyStatus(isOnDuty) {
            return API.patch('/auth/driver/duty', { isOnDuty });
        }
    },

    // Booking endpoints
    booking: {
        async create(bookingData) {
            return API.post('/booking/create', bookingData);
        },

        async getById(bookingId) {
            return API.get(`/booking/${bookingId}`);
        },

        async simulate(bookingId) {
            return API.post(`/booking/${bookingId}/simulate`, {});
        },

        async getAll(params = {}) {
            return API.get('/booking', params);
        },

        async getDriverBookings() {
            return API.get('/booking/driver/assigned');
        },

        async accept(bookingId) {
            return API.patch(`/booking/${bookingId}/accept`);
        },

        async updateStatus(bookingId, status, notes = '', location = null) {
            return API.patch(`/booking/${bookingId}/status`, {
                status,
                notes,
                location
            });
        },
        async submitDriverReport(bookingId, report) {
            return API.patch(`/booking/${bookingId}/report`, report);
        },

        async cancel(bookingId, reason, cancelledBy = 'patient') {
            return API.patch(`/booking/${bookingId}/cancel`, {
                reason,
                cancelledBy
            });
        }
    },

    // Location endpoints
    location: {
        async updateLocation(locationData) {
            return API.post('/location/update', locationData);
        },

        async getNearbyAmbulances(latitude, longitude, radius = 10) {
            return API.post('/location/nearby-ambulances', {
                latitude,
                longitude,
                radius
            });
        },

        async getAllAmbulanceLocations(status = null) {
            const params = status ? { status } : {};
            return API.get('/location/ambulances', params);
        },

        async trackAmbulance(ambulanceId) {
            return API.get(`/location/ambulance/${ambulanceId}/track`);
        },

        async getNearbyHospitals(latitude, longitude, radius = 20, specialty = null) {
            return API.post('/location/nearby-hospitals', {
                latitude,
                longitude,
                radius,
                specialty
            });
        }
    },

    // Hospital endpoints
    hospital: {
        async getIncoming() {
            return API.get('/hospital/incoming');
        },

        async acceptAmbulance(bookingId) {
            return API.patch(`/hospital/accept/${bookingId}`);
        },

        async getStats(period = '7d') {
            return API.get('/hospital/stats', { period });
        },

        async getPreparationGuidelines(severity) {
            return API.get(`/hospital/preparation/${severity}`);
        }
    },

    // Admin endpoints
    admin: {
        async getDashboard() {
            return API.get('/admin/dashboard');
        },

        async getAmbulances(params = {}) {
            return API.get('/admin/ambulances', params);
        },

        async createAmbulance(data) {
            return API.post('/admin/ambulances', data);
        },

        async updateAmbulance(id, data) {
            return API.patch(`/admin/ambulances/${id}`, data);
        },

        async getDrivers(params = {}) {
            return API.get('/admin/drivers', params);
        },

        async updateDriverStatus(id, status) {
            return API.patch(`/admin/drivers/${id}/status`, status);
        },

        async getHospitals(params = {}) {
            return API.get('/admin/hospitals', params);
        },

        async getAnalytics(period = '7d') {
            return API.get('/admin/analytics', { period });
        },

        async assignAmbulance(bookingId, ambulanceId) {
            return API.patch(`/admin/bookings/${bookingId}/assign`, {
                ambulanceId
            });
        }
    },

    // Error handling helper
    handleError(error) {
        console.error('API Error:', error);
        
        if (error.message.includes('Network')) {
            Utils.showError(CONFIG.ERROR_MESSAGES.NETWORK_ERROR);
        } else if (error.message.includes('401') || error.message.includes('403')) {
            // Unauthorized - redirect to login
            this.removeAuthToken();
            Utils.showError('Session expired. Please login again.');
            setTimeout(() => {
                window.location.href = '#login';
            }, 2000);
        } else {
            Utils.showError(error.message || 'An unexpected error occurred');
        }
        
        throw error;
    }
};
