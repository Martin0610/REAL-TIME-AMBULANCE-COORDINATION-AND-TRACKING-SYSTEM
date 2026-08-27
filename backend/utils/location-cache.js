// In-memory location cache (Redis-like behavior)
// Stores latest driver locations for instant map updates

class LocationCache {
    constructor() {
        this.cache = new Map(); // driverId -> location data
        this.bookingDriverMap = new Map(); // bookingId -> driverId
        this.cleanupInterval = 5 * 60 * 1000; // 5 minutes
        
        // Auto-cleanup old entries
        setInterval(() => this.cleanup(), this.cleanupInterval);
    }
    
    // Store driver location
    setDriverLocation(driverId, locationData) {
        this.cache.set(driverId, {
            ...locationData,
            timestamp: Date.now()
        });
    }
    
    // Get driver location
    getDriverLocation(driverId) {
        return this.cache.get(driverId);
    }
    
    // Map booking to driver
    setBookingDriver(bookingId, driverId) {
        this.bookingDriverMap.set(bookingId, driverId);
    }
    
    // Get driver for booking
    getDriverForBooking(bookingId) {
        const driverId = this.bookingDriverMap.get(bookingId);
        if (driverId) {
            return this.getDriverLocation(driverId);
        }
        return null;
    }
    
    // Remove booking mapping
    removeBooking(bookingId) {
        this.bookingDriverMap.delete(bookingId);
    }
    
    // Cleanup old entries (older than 10 minutes)
    cleanup() {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutes
        
        for (const [driverId, data] of this.cache.entries()) {
            if (now - data.timestamp > maxAge) {
                this.cache.delete(driverId);
                console.log(`🧹 Cleaned up old location for driver: ${driverId}`);
            }
        }
    }
    
    // Get all active drivers
    getAllActiveDrivers() {
        const now = Date.now();
        const maxAge = 2 * 60 * 1000; // 2 minutes
        const active = [];
        
        for (const [driverId, data] of this.cache.entries()) {
            if (now - data.timestamp < maxAge) {
                active.push({ driverId, ...data });
            }
        }
        
        return active;
    }
    
    // Calculate distance moved (in meters)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c; // Distance in meters
    }
    
    // Check if location update is significant (moved > 10 meters)
    isSignificantMove(driverId, newLat, newLon) {
        const cached = this.cache.get(driverId);
        if (!cached) return true; // First update
        
        const distance = this.calculateDistance(
            cached.latitude,
            cached.longitude,
            newLat,
            newLon
        );
        
        return distance > 10; // Only update if moved > 10 meters
    }
}

// Singleton instance
const locationCache = new LocationCache();

module.exports = locationCache;
