// Tracking service (demo-friendly)
const TrackingService = {
    init() {
        this.setupTrackingForm();
        if (!CONFIG.DEMO_MODE) {
            this.connectSocket();
        }
    },

    setupTrackingForm() {
        const trackButton = document.getElementById('track-button');
        const bookingIdInput = document.getElementById('booking-id');

        if (trackButton) {
            trackButton.addEventListener('click', () => {
                const bookingId = bookingIdInput?.value?.trim();
                if (bookingId) {
                    BookingService.trackBooking(bookingId);
                }
            });
        }

        if (bookingIdInput) {
            bookingIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const bookingId = e.target.value.trim();
                    if (bookingId) {
                        BookingService.trackBooking(bookingId);
                    }
                }
            });

            bookingIdInput.addEventListener('input', (e) => {
                let value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                e.target.value = value;
            });
        }
    },

    connectSocket() {
        if (typeof io === 'undefined') {
            console.warn('Socket client not available. Demo mode enabled.');
            return;
        }
        this.socket = io(CONFIG.SOCKET_URL);
    },

    // Join a booking room and start listening for updates
    async joinBookingRoom(bookingId) {
        if (!this.socket) {
            this.connectSocket();
            if (!this.socket) return;
        }

        this.socket.emit('join-room', `booking-${bookingId}`);

        // Ambulance location updates
        this.socket.off('ambulance-location');
        this.socket.on('ambulance-location', (data) => {
            // Forward to BookingService handler if available
            if (window.BookingService && typeof BookingService.onAmbulanceLocation === 'function') {
                BookingService.onAmbulanceLocation(data);
            }
        });

        // Traffic updates
        this.socket.off('traffic-update');
        this.socket.on('traffic-update', (data) => {
            if (window.BookingService && typeof BookingService.onTrafficUpdate === 'function') {
                BookingService.onTrafficUpdate(data);
            }
        });
    }
};
