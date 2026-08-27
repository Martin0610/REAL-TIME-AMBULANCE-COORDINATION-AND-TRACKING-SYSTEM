require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Ambulance = require('../models/Ambulance');
const Booking = require('../models/Booking');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('Connected. Seeding data...');

  const hash = await bcrypt.hash('driver123', 10);

  // Update all 10 drivers with proper data
  const drivers = [
    { email: 'm.mohamedanas10.06@gmail.com', name: 'Mohamed Anas', phone: '6379228382', licenseNumber: 'TN-2024-001' },
    { email: 'mjv3140@gmail.com', name: 'Marten Jothi Victor', phone: '7200336447', licenseNumber: 'TN-2024-002' },
    { email: 'driver3@ambulance.com', name: 'Kalai', phone: '6379938083', licenseNumber: 'TN-2024-003' },
    { email: 'driver4@ambulance.com', name: 'Maddy', phone: '9790717194', licenseNumber: 'TN-2024-004' },
    { email: 'driver5@ambulance.com', name: 'Aaqib', phone: '9841819993', licenseNumber: 'TN-2024-005' },
    { email: 'driver6@ambulance.com', name: 'Loki', phone: '8939550800', licenseNumber: 'TN-2024-006' },
    { email: 'driver7@ambulance.com', name: 'Hariprasath', phone: '7305676943', licenseNumber: 'TN-2024-007' },
    { email: 'driver8@ambulance.com', name: 'Harshan', phone: '6379025785', licenseNumber: 'TN-2024-008' },
    { email: 'driver9@ambulance.com', name: 'K7', phone: '8825765257', licenseNumber: 'TN-2024-009' },
    { email: 'driver10@ambulance.com', name: 'Haroun', phone: '8609445730', licenseNumber: 'TN-2024-010' },
  ];

  for (const d of drivers) {
    await User.updateOne({ email: d.email }, {
      name: d.name, phone: d.phone, licenseNumber: d.licenseNumber,
      password: hash, isApproved: true, isActive: true, isOnDuty: true
    });
    console.log(`✅ Driver updated: ${d.name}`);
  }

  // Update all ambulances to available
  await Ambulance.updateMany({}, { status: 'available' });
  console.log('✅ All ambulances set to available');

  // Update hospitals with proper data
  const hospitals = await User.find({ role: 'hospital' });
  for (const h of hospitals) {
    await User.updateOne({ _id: h._id }, { isApproved: true, isActive: true });
    console.log(`✅ Hospital active: ${h.hospitalName}`);
  }

  // Ensure admin exists
  const admin = await User.findOne({ role: 'admin' });
  if (admin) {
    const adminHash = await bcrypt.hash('admin123', 10);
    await User.updateOne({ role: 'admin' }, { password: adminHash, isActive: true, isApproved: true });
    console.log('✅ Admin password reset: admin123');
  }

  // Summary
  const driverCount = await User.countDocuments({ role: 'driver', isApproved: true });
  const hospitalCount = await User.countDocuments({ role: 'hospital', isApproved: true });
  const ambulanceCount = await Ambulance.countDocuments({ status: 'available' });
  const bookingCount = await Booking.countDocuments();

  console.log('\n📊 Database Summary:');
  console.log(`   Drivers: ${driverCount}`);
  console.log(`   Hospitals: ${hospitalCount}`);
  console.log(`   Available Ambulances: ${ambulanceCount}`);
  console.log(`   Total Bookings: ${bookingCount}`);

  mongoose.disconnect();
  console.log('\n✅ All data seeded successfully!');
});
