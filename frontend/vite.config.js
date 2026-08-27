import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true   // exposes on 0.0.0.0 — accessible from mobile on same WiFi
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        entry: resolve(__dirname, 'entry.html'),
        patientBooking: resolve(__dirname, 'patient-booking.html'),
        driverDashboard: resolve(__dirname, 'driver-dashboard.html'),
        hospitalDashboard: resolve(__dirname, 'hospital-dashboard.html'),
        adminDashboard: resolve(__dirname, 'admin-dashboard.html'),
        providerLogin: resolve(__dirname, 'provider-login.html'),
        enhancedRegistration: resolve(__dirname, 'enhanced-registration.html'),
        patient: resolve(__dirname, 'patient.html')
      }
    }
  }
});
