// Main application initialization and navigation
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupNavigation();
    setupMobileMenu();
    handleInitialRoute();
    setupGlobalEventListeners();
});

function initializeApp() {
    try {
        AuthService.init();
        LocationService.init();
        BookingService.init();
        TrackingService.init();
        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        Utils.showError('Application initialization failed', 'Please refresh the page and try again.');
    }
}

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                const sectionId = href.substring(1);
                showSection(sectionId);
                navLinks.forEach((l) => l.classList.remove('active'));
                link.classList.add('active');
                closeMobileMenu();
            }
        });
    });
}

function setupMobileMenu() {
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
            }
        });
    }
}

function closeMobileMenu() {
    const navMenu = document.getElementById('nav-menu');
    if (navMenu) {
        navMenu.classList.remove('active');
    }
}

function showSection(sectionId) {
    const sections = document.querySelectorAll('.section');
    sections.forEach((section) => {
        section.classList.remove('active');
    });

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        window.location.hash = sectionId;
        handleSectionChange(sectionId);
    }
}

function handleSectionChange(sectionId) {
    switch (sectionId) {
        case 'home':
            updateAvailableAmbulances();
            break;
        case 'book':
            resetBookingForm();
            break;
        case 'track':
            const trackingInput = document.getElementById('booking-id');
            if (trackingInput) {
                setTimeout(() => trackingInput.focus(), 100);
            }
            break;
    }
}

function handleInitialRoute() {
    const hash = window.location.hash.substring(1);
    if (hash && document.getElementById(hash)) {
        showSection(hash);
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach((link) => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${hash}`) {
                link.classList.add('active');
            }
        });
    } else {
        showSection('home');
    }
}

function setupGlobalEventListeners() {
    window.addEventListener('online', () => {
        Utils.showToast('Connection restored', 'success');
    });

    window.addEventListener('offline', () => {
        Utils.showToast('Connection lost', 'error');
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            refreshActiveData();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
}

function updateAvailableAmbulances() {
    const availableElement = document.getElementById('available-ambulances');
    if (availableElement) {
        setTimeout(() => {
            const count = Math.floor(Math.random() * 6) + 9;
            availableElement.textContent = count;
        }, 400);
    }
}

function resetBookingForm() {
    const form = document.getElementById('booking-form');
    if (form) {
        form.reset();
        LocationService.currentPosition = null;
        LocationService.updateLocationStatus('Click to detect your location');
        LocationService.initializeMap();
        
        // Re-display hospitals after map reset
        setTimeout(() => {
            if (window.BookingService && typeof BookingService.displayHospitalsOnMap === 'function') {
                BookingService.displayHospitalsOnMap('location-map');
            }
        }, 300);

        const assigned = document.getElementById('assigned-ambulance-content');
        if (assigned) assigned.textContent = 'No ambulance assigned yet.';
    }
}

function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach((modal) => {
        modal.style.display = 'none';
    });
}

function refreshActiveData() {
    const activeSection = document.querySelector('.section.active');
    if (!activeSection) return;
    if (activeSection.id === 'home') {
        updateAvailableAmbulances();
    }
}

window.showSection = showSection;
window.closeModal = Utils.closeModal;
