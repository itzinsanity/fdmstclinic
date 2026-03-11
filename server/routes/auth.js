'use strict';

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Patient = require('../models/Patient');
const HealthRecord = require('../models/HealthRecord');
const { authLimiter, registerLimiter } = require('../middleware/rateLimiter');

const sendToken = (user, statusCode, res) => {
  const token = user.generateToken();
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role
    }
  });
};

// POST /api/auth/register
router.post('/register', registerLimiter, [
  body('firstName').trim().notEmpty().withMessage('First name is required.').isLength({ max: 50 }),
  body('lastName').trim().notEmpty().withMessage('Last name is required.').isLength({ max: 50 }),
  body('email').isEmail().withMessage('Please provide a valid email.').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must have uppercase, lowercase, and a number.'),
  body('phone').optional().isMobilePhone().withMessage('Please provide a valid phone number.'),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format.'),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer_not_to_say'])
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { firstName, lastName, email, password, phone, dateOfBirth, gender, address } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const user = await User.create({ firstName, lastName, email, password, phone, dateOfBirth, gender, address, role: 'patient' });
    const patient = await Patient.create({ user: user._id });
    await HealthRecord.create({ patient: patient._id, patientUser: user._id });

    sendToken(user, 201, res);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user || !await user.comparePassword(password)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been suspended. Please contact the clinic.' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
router.post('/change-password', require('../middleware/auth').protect, [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must have uppercase, lowercase, and a number.')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  try {
    const user = await User.findById(req.user.id).select('+password');
    if (!await user.comparePassword(req.body.currentPassword)) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }
    user.password = req.body.newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
