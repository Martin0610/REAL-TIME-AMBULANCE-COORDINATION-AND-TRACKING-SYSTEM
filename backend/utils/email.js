const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASS) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT),
    secure: Number(EMAIL_PORT) === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });

  return cachedTransporter;
}

async function sendEmail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('Email not configured. Skipping email send.');
    return { skipped: true };
  }

  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    html
  });
}

module.exports = { sendEmail };
