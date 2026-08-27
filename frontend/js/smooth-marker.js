// Smooth Marker Animation (Zomato-style)
// Animates marker movement instead of jumping

class SmoothMarker {
    constructor(map, initialPosition, icon) {
        this.map = map;
        this.currentPosition = initialPosition;
        this.targetPosition = initialPosition;
        this.icon = icon;
        this.animationFrameId = null;
        this.animationDuration = 1000; // 1 second smooth transition
        this.animationStartTime = null;
        this.startPosition = null;
        
        // Create marker
        this.marker = L.marker(initialPosition, { icon: icon }).addTo(map);
    }
    
    // Update target position and animate
    moveTo(newPosition, heading = null) {
        // Cancel any ongoing animation
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // Set up animation
        this.startPosition = { ...this.currentPosition };
        this.targetPosition = newPosition;
        this.animationStartTime = Date.now();
        
        // Update marker rotation if heading provided
        if (heading !== null && this.marker._icon) {
            this.marker._icon.style.transform += ` rotate(${heading}deg)`;
        }
        
        // Start animation
        this.animate();
    }
    
    // Smooth animation using easing
    animate() {
        const now = Date.now();
        const elapsed = now - this.animationStartTime;
        const progress = Math.min(elapsed / this.animationDuration, 1);
        
        // Easing function (ease-out)
        const eased = 1 - Math.pow(1 - progress, 3);
        
        // Interpolate position
        const lat = this.startPosition.lat + 
                    (this.targetPosition.lat - this.startPosition.lat) * eased;
        const lng = this.startPosition.lng + 
                    (this.targetPosition.lng - this.startPosition.lng) * eased;
        
        this.currentPosition = { lat, lng };
        this.marker.setLatLng([lat, lng]);
        
        // Continue animation if not complete
        if (progress < 1) {
            this.animationFrameId = requestAnimationFrame(() => this.animate());
        } else {
            this.animationFrameId = null;
        }
    }
    
    // Get current position
    getPosition() {
        return this.currentPosition;
    }
    
    // Update popup
    bindPopup(content) {
        this.marker.bindPopup(content);
        return this;
    }
    
    // Open popup
    openPopup() {
        this.marker.openPopup();
        return this;
    }
    
    // Remove marker
    remove() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.marker.remove();
    }
    
    // Get Leaflet marker instance
    getMarker() {
        return this.marker;
    }
}

// Auto-follow feature (keeps ambulance centered)
class MapAutoFollow {
    constructor(map, marker, options = {}) {
        this.map = map;
        this.marker = marker;
        this.enabled = options.enabled !== false;
        this.zoom = options.zoom || 15;
        this.padding = options.padding || [50, 50];
    }
    
    // Enable auto-follow
    enable() {
        this.enabled = true;
        this.follow();
    }
    
    // Disable auto-follow
    disable() {
        this.enabled = false;
    }
    
    // Follow marker
    follow() {
        if (!this.enabled) return;
        
        const position = this.marker.getPosition();
        this.map.setView([position.lat, position.lng], this.zoom, {
            animate: true,
            duration: 0.5
        });
    }
    
    // Toggle auto-follow
    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.follow();
        }
        return this.enabled;
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SmoothMarker, MapAutoFollow };
}
