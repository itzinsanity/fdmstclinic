'use strict';

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Patient = require('../models/Patient');
const TeethRecord = require('../models/TeethRecord');
const { protect, authorize } = require('../middleware/auth');

// IMPORTANT: /my/profile MUST be defined before /:id
// Otherwise Express matches the literal string "my" as a Mongo ObjectId param.

// GET /api/patients/my/profile
router.get('/my/profile', protect, authorize('patient'), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    const patientRecord = await Patient.findOne({ user: req.user.id });
    const teethRecord = await TeethRecord.findOne({ patientUser: req.user.id });
    res.json({ success: true, data: { user, patientRecord, teethRecord } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/patients/my/profile
router.put('/my/profile', protect, authorize('patient'), [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('phone').optional()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const allowed = ['firstName', 'lastName', 'phone', 'gender', 'address'];
    const updates = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true }).select('-password');
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// GET /api/patients (staff/admin list)
router.get('/', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let userQuery = { role: 'patient' };
    if (search) {
      userQuery.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    const [users, total] = await Promise.all([
      User.find(userQuery).select('-password').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
      User.countDocuments(userQuery)
    ]);
    const userIds = users.map(u => u._id);
    const patients = await Patient.find({ user: { $in: userIds } });
    const patientMap = {};
    patients.forEach(p => { patientMap[p.user.toString()] = p; });
    const combined = users.map(u => ({ ...u.toJSON(), patientRecord: patientMap[u._id.toString()] || null }));
    res.json({ success: true, data: combined, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:id (staff/admin single patient)
router.get('/:id', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user || user.role !== 'patient') {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }
    const patientRecord = await Patient.findOne({ user: user._id });
    const teethRecord = await TeethRecord.findOne({ patientUser: user._id });
    res.json({ success: true, data: { user, patientRecord, teethRecord } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/patients/:id (staff/admin update patient record)
router.put('/:id', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const allowed = ['allergies', 'bloodType', 'currentMedications', 'medicalConditions', 'emergencyContact', 'notes', 'dentalHistory'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const patient = await Patient.findOneAndUpdate({ user: req.params.id }, updates, { new: true, runValidators: true });
    if (!patient) return res.status(404).json({ success: false, message: 'Patient record not found.' });
    res.json({ success: true, data: patient });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
