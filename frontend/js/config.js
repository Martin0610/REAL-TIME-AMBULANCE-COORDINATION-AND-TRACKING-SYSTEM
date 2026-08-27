// Configuration settings
const CONFIG = {
    DEMO_MODE: false,
    API_BASE_URL: (function(){
        if (window.__BACKEND_URL__) return `${window.__BACKEND_URL__.replace(/\/$/, '')}/api`;
        const host = window.location.hostname;
        if ((host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host)) && window.location.port !== '5001') {
            return `http://${host}:5001/api`;
        }
        return `${window.location.origin}/api`;
    })(),
    SOCKET_URL: (function(){
        if (window.__BACKEND_URL__) return window.__BACKEND_URL__.replace(/\/$/, '');
        const host = window.location.hostname;
        if ((host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host)) && window.location.port !== '5001') {
            return `http://${host}:5001`;
        }
        return window.location.origin;
    })(),
    
    CHENNAI_BOUNDS: {
        north: 13.2847,
        south: 12.5000,  // Extended to cover Madurantakam
        east: 80.3463,
        west: 79.8833    // Extended to cover Chengalpattu
    },
    
    SERVICE_AREAS: {
        // Chengalpattu District
        chengalpattu: { lat: 12.6917, lng: 79.9757, name: 'Chengalpattu' },
        madurantakam: { lat: 12.5033, lng: 79.8833, name: 'Madurantakam' },
        
        // South Chennai
        vandalur: { lat: 12.8924, lng: 80.0785, name: 'Vandalur' },
        perungalathur: { lat: 12.8969, lng: 80.0878, name: 'Perungalathur' },
        tambaram: { lat: 12.9249, lng: 80.1000, name: 'Tambaram' },
        chrompet: { lat: 12.9516, lng: 80.1462, name: 'Chrompet' },
        pallavaram: { lat: 12.9675, lng: 80.1491, name: 'Pallavaram' },
        
        // Central Chennai
        guindy: { lat: 13.0067, lng: 80.2206, name: 'Guindy' },
        adyar: { lat: 13.0067, lng: 80.2570, name: 'Adyar' },
        velachery: { lat: 12.9750, lng: 80.2167, name: 'Velachery' },
        tnagar: { lat: 13.0418, lng: 80.2341, name: 'T.Nagar' },
        porur: { lat: 13.0358, lng: 80.1556, name: 'Porur' },
        
        // North Chennai
        perambur: { lat: 13.1143, lng: 80.2378, name: 'Perambur' },
        tondiarpet: { lat: 13.1290, lng: 80.2847, name: 'Tondiarpet' },
        avadi: { lat: 13.1147, lng: 80.1018, name: 'Avadi' },
        
        // OMR & ECR
        omr_thoraipakkam: { lat: 12.9391, lng: 80.2340, name: 'OMR Thoraipakkam' },
        ecr_thiruvanmiyur: { lat: 12.9833, lng: 80.2611, name: 'ECR Thiruvanmiyur' },
        medavakkam: { lat: 12.9200, lng: 80.1920, name: 'Medavakkam' },
        sholinganallur: { lat: 12.9010, lng: 80.2279, name: 'Sholinganallur' },
        kelambakkam: { lat: 12.7833, lng: 80.2167, name: 'Kelambakkam' }
    },
    
    DEFAULT_LOCATION: {
        lat: 13.0827,
        lng: 80.2707
    },
    
    MAP_ZOOM: 12,
    MAP_STYLE: 'roadmap',
    
    LOCATION_UPDATE_INTERVAL: 10000,
    TRACKING_UPDATE_INTERVAL: 5000,
    
    SEVERITY_LEVELS: {
        1: { label: 'Minor', color: '#059669', description: 'Non-urgent medical attention needed' },
        2: { label: 'Moderate', color: '#d97706', description: 'Medical attention required soon' },
        3: { label: 'Serious', color: '#dc2626', description: 'Urgent medical attention needed' },
        4: { label: 'Critical', color: '#b91c1c', description: 'Life-threatening condition' },
        5: { label: 'Life-threatening', color: '#7c2d12', description: 'Immediate life-saving intervention required' }
    },
    
    BOOKING_STATUS: {
        pending: { label: 'Pending', color: '#f59e0b', icon: 'clock' },
        assigned: { label: 'Assigned', color: '#3b82f6', icon: 'user-check' },
        accepted: { label: 'Accepted', color: '#8b5cf6', icon: 'check-double' },
        'en-route': { label: 'En Route', color: '#8b5cf6', icon: 'route' },
        arrived: { label: 'Arrived', color: '#06b6d4', icon: 'map-marker-alt' },
        'picked-up': { label: 'Patient Picked Up', color: '#10b981', icon: 'user-plus' },
        transporting: { label: 'Transporting', color: '#10b981', icon: 'ambulance' },
        completed: { label: 'Completed', color: '#059669', icon: 'check-circle' },
        cancelled: { label: 'Cancelled', color: '#ef4444', icon: 'times-circle' }
    },
    
    ERROR_MESSAGES: {
        NETWORK_ERROR: 'Network error. Please check your internet connection.',
        LOCATION_ERROR: 'Unable to get your location. Please enter address manually.',
        BOOKING_ERROR: 'Failed to create booking. Please try again.',
        TRACKING_ERROR: 'Unable to track ambulance. Please check booking ID.',
        LOGIN_ERROR: 'Login failed. Please check your credentials.',
        VALIDATION_ERROR: 'Please fill in all required fields correctly.'
    },
    
    SUCCESS_MESSAGES: {
        BOOKING_CREATED: 'Your ambulance booking has been created successfully!',
        LOCATION_DETECTED: 'Location detected successfully.',
        LOGIN_SUCCESS: 'Login successful. Redirecting to dashboard...'
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
