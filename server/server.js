'use strict';

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const appointmentRoutes = require('./routes/appointments');
const inventoryRoutes = require('./routes/inventory');
const feedbackRoutes = require('./routes/feedback');
const analyticsRoutes = require('./routes/analytics');
const trashRoutes = require('./routes/trash');
const promotionRoutes = require('./routes/promotions');

const app = express();

connectDB();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/trash', trashRoutes);
app.use('/api/promotions', promotionRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'operational', timestamp: new Date().toISOString() });
});

// Users management (admin only)
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const { protect, authorize } = require('./middleware/auth');

app.get('/api/users', protect, authorize('admin'), async (req, res, next) => {
  try {
    const users = await User.find({ role: { $in: ['staff', 'admin'] } }).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

app.post('/api/users', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, role, phone } = req.body;
    if (!['staff', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role. Only staff or admin.' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: 'Email already in use.' });
    const user = await User.create({ firstName, lastName, email, password, role, phone });
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
});

app.patch('/api/users/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, role, password } = req.body;
    if (role && !['staff', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role. Only staff or admin allowed.' });
    }
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: req.params.id } });
      if (existing) return res.status(409).json({ success: false, message: 'Email already in use by another account.' });
    }
    const updates = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName  !== undefined) updates.lastName  = lastName;
    if (email     !== undefined) updates.email     = email;
    if (phone     !== undefined) updates.phone     = phone;
    if (role      !== undefined) updates.role      = role;

    const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Handle password separately so the pre-save hook hashes it
    if (password && password.trim().length >= 8) {
      const targetUser = await User.findById(req.params.id).select('+password');
      targetUser.password = password;
      await targetUser.save();
    }

    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

app.patch('/api/users/:id/status', protect, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// Teeth Records routes (renamed from Health Records)
const TeethRecord = require('./models/TeethRecord');

app.get('/api/records/:patientUserId', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const record = await TeethRecord.findOne({ patientUser: req.params.patientUserId })
      .populate('patientUser', 'firstName lastName email');
    if (!record) return res.status(404).json({ success: false, message: 'Teeth record not found.' });
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
});

app.patch('/api/records/:patientUserId', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const allowed = ['dentalChart', 'periodontalStatus', 'oralHygieneRating', 'allergiesNotes', 'pharmacyNotes'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const record = await TeethRecord.findOneAndUpdate({ patientUser: req.params.patientUserId }, updates, { new: true });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
});

app.post('/api/records/:patientUserId/treatment', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const record = await TeethRecord.findOne({ patientUser: req.params.patientUserId });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });
    record.treatmentHistory.push({ ...req.body, dentist: req.user.id });
    await record.save();
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
});

// SPA catch-all
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

module.exports = app;
