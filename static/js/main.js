/**
 * UBus Tracking System - Main JavaScript
 */

// GPS Update Interval (matches Django settings)
const GPS_UPDATE_INTERVAL = 5000; // 5 seconds

// Bus Location Tracker
class BusTracker {
    constructor(mapElementId) {
        this.map = null;
        this.markers = {};
        this.routes = {};
        this.updateInterval = null;
        this.mapElementId = mapElementId;
    }

    init(centerLat = 0, centerLng = 0, zoom = 15) {
        this.map = L.map(this.mapElementId).setView([centerLat, centerLng], zoom);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);
        
        return this;
    }

    createBusIcon(status = 'active') {
        const colors = {
            active: '#198754',
            idle: '#ffc107',
            offline: '#6c757d'
        };
        
        return L.divIcon({
            className: 'bus-marker-icon ' + status,
            html: '<i class="fas fa-bus"></i>',
            iconSize: [35, 35],
            iconAnchor: [17, 17]
        });
    }

    updateBusLocation(busId, lat, lng, busNumber, status = 'active', route = '') {
        if (this.markers[busId]) {
            this.markers[busId].setLatLng([lat, lng]);
            this.markers[busId].setIcon(this.createBusIcon(status));
        } else {
            this.markers[busId] = L.marker([lat, lng], {
                icon: this.createBusIcon(status)
            }).addTo(this.map);
        }
        
        this.markers[busId].bindPopup(`
            <div class="bus-popup-title">${busNumber}</div>
            <div class="bus-popup-info">
                <span><i class="fas fa-route me-1"></i>${route || 'No route assigned'}</span>
                <span><i class="fas fa-circle me-1" style="color: ${status === 'active' ? '#198754' : '#ffc107'}"></i>${status}</span>
            </div>
        `);
    }

    removeBus(busId) {
        if (this.markers[busId]) {
            this.map.removeLayer(this.markers[busId]);
            delete this.markers[busId];
        }
    }

    drawRoute(routeId, coordinates, color = '#0d6efd') {
        if (this.routes[routeId]) {
            this.map.removeLayer(this.routes[routeId]);
        }
        
        this.routes[routeId] = L.polyline(coordinates, {
            color: color,
            weight: 4,
            opacity: 0.8
        }).addTo(this.map);
    }

    addStop(lat, lng, name, order) {
        const icon = L.divIcon({
            className: 'stop-marker',
            html: `<span style="font-size: 12px; font-weight: bold;">${order}</span>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        return L.marker([lat, lng], { icon }).addTo(this.map)
            .bindPopup(`<strong>${name}</strong><br>Stop #${order}`);
    }

    startAutoUpdate(apiUrl) {
        this.updateInterval = setInterval(() => {
            this.fetchAndUpdateBuses(apiUrl);
        }, GPS_UPDATE_INTERVAL);
        
        // Initial fetch
        this.fetchAndUpdateBuses(apiUrl);
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    fetchAndUpdateBuses(apiUrl) {
        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                data.forEach(bus => {
                    this.updateBusLocation(
                        bus.id,
                        bus.latitude,
                        bus.longitude,
                        bus.bus_number,
                        bus.status,
                        bus.route_name
                    );
                });
            })
            .catch(error => console.error('Error fetching bus locations:', error));
    }

    fitToBounds() {
        const allMarkers = Object.values(this.markers);
        if (allMarkers.length > 0) {
            const group = L.featureGroup(allMarkers);
            this.map.fitBounds(group.getBounds(), { padding: [20, 20] });
        }
    }
}


// ETA Calculator
class ETACalculator {
    constructor() {
        this.earthRadius = 6371; // km
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return this.earthRadius * c;
    }

    toRad(deg) {
        return deg * (Math.PI / 180);
    }

    calculateETA(distanceKm, speedKmh = 25) {
        const hours = distanceKm / speedKmh;
        return Math.round(hours * 60); // minutes
    }

    formatETA(minutes) {
        if (minutes < 1) return 'Arriving';
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h ${mins}m`;
    }
}


// Notification Manager
class NotificationManager {
    constructor() {
        this.pollInterval = 30000; // 30 seconds
        this.intervalId = null;
    }

    start(apiUrl, countBadge, listContainer) {
        this.intervalId = setInterval(() => {
            this.fetch(apiUrl, countBadge, listContainer);
        }, this.pollInterval);
        
        // Initial fetch
        this.fetch(apiUrl, countBadge, listContainer);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    fetch(apiUrl, countBadge, listContainer) {
        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                this.updateUI(data, countBadge, listContainer);
            })
            .catch(error => console.error('Error fetching notifications:', error));
    }

    updateUI(notifications, countBadge, listContainer) {
        if (countBadge) {
            if (notifications.length > 0) {
                countBadge.textContent = notifications.length;
                countBadge.style.display = 'inline';
                countBadge.classList.add('notification-badge');
            } else {
                countBadge.style.display = 'none';
            }
        }

        if (listContainer) {
            if (notifications.length > 0) {
                listContainer.innerHTML = notifications.slice(0, 5).map(n => `
                    <a href="/notifications/${n.notification_id}/" class="notification-item d-block text-decoration-none">
                        <strong>${n.title}</strong>
                        <p class="text-muted small mb-0">${n.message.substring(0, 50)}...</p>
                    </a>
                `).join('');
            } else {
                listContainer.innerHTML = '<div class="notification-item text-center text-muted">No new notifications</div>';
            }
        }
    }
}


// Driver Location Reporter
class DriverLocationReporter {
    constructor() {
        this.watchId = null;
        this.lastUpdate = null;
        this.updateThreshold = GPS_UPDATE_INTERVAL;
    }

    start(apiUrl, busId) {
        if ('geolocation' in navigator) {
            this.watchId = navigator.geolocation.watchPosition(
                (position) => this.handlePosition(position, apiUrl, busId),
                (error) => this.handleError(error),
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                }
            );
        } else {
            console.error('Geolocation not supported');
        }
    }

    stop() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    handlePosition(position, apiUrl, busId) {
        const now = Date.now();
        
        if (this.lastUpdate && (now - this.lastUpdate) < this.updateThreshold) {
            return;
        }
        
        this.lastUpdate = now;
        
        const data = {
            bus_id: busId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speed: position.coords.speed || 0,
            heading: position.coords.heading || 0
        };
        
        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCsrfToken()
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => console.log('Location updated:', result))
        .catch(error => console.error('Error updating location:', error));
    }

    handleError(error) {
        switch (error.code) {
            case error.PERMISSION_DENIED:
                console.error('User denied geolocation permission');
                break;
            case error.POSITION_UNAVAILABLE:
                console.error('Location information unavailable');
                break;
            case error.TIMEOUT:
                console.error('Location request timed out');
                break;
            default:
                console.error('Unknown geolocation error');
        }
    }

    getCsrfToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
               document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1] || '';
    }
}


// Export for use
window.UBus = {
    BusTracker,
    ETACalculator,
    NotificationManager,
    DriverLocationReporter
};
