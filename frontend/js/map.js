// Map utilities for Leaflet integration
const MapService = {
    maps: {},
    
    // Create a new map instance
    createMap(containerId, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        const defaultOptions = {
            center: [13.0827, 80.2707], // Chennai center
            zoom: 11,
            zoomControl: true,
            attributionControl: true
        };

        const mapOptions = { ...defaultOptions, ...options };
        
        // Create map
        const map = L.map(containerId, {
            center: mapOptions.center,
            zoom: mapOptions.zoom,
            zoomControl: mapOptions.zoomControl,
            attributionControl: mapOptions.attributionControl
        });

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '(c) OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);

        // Store map reference
        this.maps[containerId] = {
            map: map,
            markers: {},
            layers: {}
        };

        return map;
    },

    // Add marker to map
    addMarker(mapId, markerId, lat, lng, options = {}) {
        const mapInstance = this.maps[mapId];
        if (!mapInstance) return null;

        const defaultOptions = {
            icon: 'map-marker-alt',
            color: '#dc2626',
            popup: null
        };

        const markerOptions = { ...defaultOptions, ...options };

        // Create custom icon if specified
        let icon;
        if (markerOptions.icon && markerOptions.color) {
            icon = L.divIcon({
                className: 'custom-marker',
                html: `<i class="fas fa-${markerOptions.icon}" style="color: ${markerOptions.color}; font-size: 20px;"></i>`,
                iconSize: [25, 25],
                iconAnchor: [12, 25]
            });
        }

        // Create marker
        const marker = L.marker([lat, lng], icon ? { icon } : {})
            .addTo(mapInstance.map);

        // Add popup if provided
        if (markerOptions.popup) {
            marker.bindPopup(markerOptions.popup);
        }

        // Store marker reference
        mapInstance.markers[markerId] = marker;

        return marker;
    },

    // Update marker position
    updateMarker(mapId, markerId, lat, lng) {
        const mapInstance = this.maps[mapId];
        if (!mapInstance || !mapInstance.markers[markerId]) return false;

        mapInstance.markers[markerId].setLatLng([lat, lng]);
        return true;
    },

    // Remove marker
    removeMarker(mapId, markerId) {
        const mapInstance = this.maps[mapId];
        if (!mapInstance || !mapInstance.markers[markerId]) return false;

        mapInstance.map.removeLayer(mapInstance.markers[markerId]);
        delete mapInstance.markers[markerId];
        return true;
    },

    // Add ambulance marker with custom icon
    addAmbulanceMarker(mapId, ambulanceId, lat, lng, data = {}) {
        const popup = `
            <div class="ambulance-popup">
                <h4><i class="fas fa-ambulance"></i> ${data.vehicleNumber || 'Ambulance'}</h4>
                <p><strong>Type:</strong> ${data.type || 'Emergency'}</p>
                <p><strong>Status:</strong> ${data.status || 'Available'}</p>
                ${data.driver ? `<p><strong>Driver:</strong> ${data.driver}</p>` : ''}
                ${data.eta ? `<p><strong>ETA:</strong> ${data.eta} min</p>` : ''}
            </div>
        `;

        // Check if using MapService or LocationService
        const mapInstance = this.maps[mapId];
        
        // Support emoji marker
        if (data.useEmoji) {
            const icon = L.divIcon({
                className: 'custom-marker-emoji',
                html: `<div style="font-size:28px; transform: translateY(-8px);">🚑</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });
            
            let marker;
            if (mapInstance) {
                // Use MapService
                marker = L.marker([lat, lng], { icon }).addTo(mapInstance.map);
                marker.bindPopup(popup);
                mapInstance.markers[`ambulance-${ambulanceId}`] = marker;
            } else if (mapId === 'location-map' && window.LocationService && LocationService.map) {
                // Use LocationService.map directly
                marker = L.marker([lat, lng], { icon }).addTo(LocationService.map);
                marker.bindPopup(popup);
            }
            
            return marker;
        }

        // Regular marker
        if (mapInstance) {
            return this.addMarker(mapId, `ambulance-${ambulanceId}`, lat, lng, {
                icon: 'ambulance',
                color: '#dc2626',
                popup: popup
            });
        } else if (mapId === 'location-map' && window.LocationService && LocationService.map) {
            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<i class="fas fa-ambulance" style="color: #dc2626; font-size: 20px;"></i>`,
                iconSize: [25, 25],
                iconAnchor: [12, 25]
            });
            
            const marker = L.marker([lat, lng], { icon })
                .addTo(LocationService.map)
                .bindPopup(popup);
            
            return marker;
        }
        
        return null;
    },

    // Add hospital marker
    addHospitalMarker(mapId, hospitalId, lat, lng, data = {}) {
        const popup = `
            <div class="hospital-popup">
                <h4><i class="fas fa-hospital"></i> ${data.name || 'Hospital'}</h4>
                <p><strong>Address:</strong> ${data.address || 'Unknown'}</p>
                ${data.capacity ? `<p><strong>Capacity:</strong> ${data.capacity} beds</p>` : ''}
                ${data.specialties ? `<p><strong>Facilities:</strong> ${data.specialties.slice(0, 3).join(', ')}${data.specialties.length > 3 ? '...' : ''}</p>` : ''}
            </div>
        `;

        // Check if using MapService or LocationService
        const mapInstance = this.maps[mapId];
        if (mapInstance) {
            // Use MapService
            return this.addMarker(mapId, `hospital-${hospitalId}`, lat, lng, {
                icon: 'hospital',
                color: '#059669',
                popup: popup
            });
        } else if (mapId === 'location-map' && window.LocationService && LocationService.map) {
            // Use LocationService.map directly
            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<i class="fas fa-hospital" style="color: #059669; font-size: 20px;"></i>`,
                iconSize: [25, 25],
                iconAnchor: [12, 25]
            });
            
            const marker = L.marker([lat, lng], { icon })
                .addTo(LocationService.map)
                .bindPopup(popup);
            
            return marker;
        }
        
        return null;
    },

    // Add patient location marker
    addPatientMarker(mapId, lat, lng, data = {}) {
        const popup = `
            <div class="patient-popup">
                <h4><i class="fas fa-user-injured"></i> Patient Location</h4>
                <p><strong>Severity:</strong> Level ${data.severity || 'Unknown'}</p>
                <p><strong>Address:</strong> ${data.address || 'Unknown'}</p>
                ${data.landmark ? `<p><strong>Landmark:</strong> ${data.landmark}</p>` : ''}
            </div>
        `;

        return this.addMarker(mapId, 'patient-location', lat, lng, {
            icon: 'user-injured',
            color: '#f59e0b',
            popup: popup
        });
    },

    // Draw route between two points (simple line)
    drawRoute(mapId, routeId, points, options = {}) {
        const mapInstance = this.maps[mapId];
        if (!mapInstance) return null;

        const defaultOptions = {
            color: '#2563eb',
            weight: 4,
            opacity: 0.7
        };

        const routeOptions = { ...defaultOptions, ...options };

        // Create polyline
        const route = L.polyline(points, routeOptions).addTo(mapInstance.map);

        // Store route reference
        mapInstance.layers[routeId] = route;

        // Fit map to route bounds
        mapInstance.map.fitBounds(route.getBounds(), { padding: [20, 20] });

        return route;
    },

    // Remove route
    removeRoute(mapId, routeId) {
        const mapInstance = this.maps[mapId];
        if (!mapInstance || !mapInstance.layers[routeId]) return false;

        mapInstance.map.removeLayer(mapInstance.layers[routeId]);
        delete mapInstance.layers[routeId];
        return true;
    },

    // Center map on location
    centerMap(mapId, lat, lng, zoom = null) {
        const mapInstance = this.maps[mapId];
        if (!mapInstance) return false;

        if (zoom) {
            mapInstance.map.setView([lat, lng], zoom);
        } else {
            mapInstance.map.panTo([lat, lng]);
        }
        return true;
    },

    // Fit map to show all markers
    fitToMarkers(mapId, padding = [20, 20]) {
        const mapInstance = this.maps[mapId];
        if (!mapInstance) return false;

        const markers = Object.values(mapInstance.markers);
        if (markers.length === 0) return false;

        const group = new L.featureGroup(markers);
        mapInstance.map.fitBounds(group.getBounds(), { padding });
        return true;
    },

    // Get map instance
    getMap(mapId) {
        return this.maps[mapId]?.map || null;
    },

    // Destroy map
    destroyMap(mapId) {
        const mapInstance = this.maps[mapId];
        if (!mapInstance) return false;

        mapInstance.map.remove();
        delete this.maps[mapId];
        return true;
    },

    // Add service area boundaries
    addServiceAreas(mapId) {
        const mapInstance = this.maps[mapId];
        if (!mapInstance) return false;

        Object.entries(CONFIG.SERVICE_AREAS).forEach(([key, area]) => {
            // Add marker for service area
            this.addMarker(mapId, `service-${key}`, area.lat, area.lng, {
                icon: 'map-pin',
                color: '#6b7280',
                popup: `<b>${area.name}</b><br>Service Area`
            });

            // Add circle to show service coverage (5km radius)
            const circle = L.circle([area.lat, area.lng], {
                radius: 5000, // 5km
                fillColor: '#dc2626',
                fillOpacity: 0.1,
                color: '#dc2626',
                weight: 1,
                opacity: 0.3
            }).addTo(mapInstance.map);

            mapInstance.layers[`service-area-${key}`] = circle;
        });

        return true;
    }
};
