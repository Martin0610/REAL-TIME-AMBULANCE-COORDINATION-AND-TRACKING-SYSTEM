const twilio = require('twilio');

// Initialize Twilio client
let twilioClient = null;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );
    console.log('✓ Twilio SMS service initialized');
} else {
    console.warn('⚠️ Twilio credentials not found - SMS notifications disabled');
}

/**
 * Send SMS notification
 * @param {string} to - Phone number to send to (with country code, e.g., +917200336447)
 * @param {string} message - Message content
 */
async function sendSMS(to, message) {
    if (!twilioClient) {
        console.log('SMS not sent - Twilio not configured');
        return { success: false, error: 'SMS service not configured' };
    }

    try {
        // Ensure phone number has country code
        let phoneNumber = to;
        if (!phoneNumber.startsWith('+')) {
            // Add India country code if not present
            phoneNumber = '+91' + phoneNumber.replace(/^0+/, '');
        }

        console.log(`📱 Sending SMS to ${phoneNumber}...`);

        const result = await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phoneNumber
        });

        console.log(`✓ SMS sent successfully. SID: ${result.sid}`);
        return { success: true, sid: result.sid };

    } catch (error) {
        console.error('❌ SMS sending failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send booking notification to driver
 * @param {string} driverPhone - Driver's phone number
 * @param {object} bookingDetails - Booking information
 */
async function sendBookingNotification(driverPhone, bookingDetails) {
    const message = `🚑 NEW EMERGENCY BOOKING!

Booking ID: ${bookingDetails.bookingId}
Location: ${bookingDetails.location}
Type: ${bookingDetails.incidentType}
Patient: ${bookingDetails.patientPhone}

Please respond immediately!`;

    return await sendSMS(driverPhone, message);
}

/**
 * Send location-based alert to specific driver
 * @param {string} driverPhone - Driver's phone number
 * @param {string} location - Pickup location
 * @param {string} bookingId - Booking ID
 */
async function sendLocationAlert(driverPhone, location, bookingId) {
    const SERVER_IP = process.env.SERVER_IP || '192.168.0.104';
    const message = `🚨 EMERGENCY ALERT!

New booking from ${location}
Booking ID: ${bookingId}

Open dashboard to accept:
http://${SERVER_IP}:5174/driver-dashboard.html?booking=${bookingId}`;

    return await sendSMS(driverPhone, message);
}

module.exports = {
    sendSMS,
    sendBookingNotification,
    sendLocationAlert
};
