'use strict';

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const { protect, authorize } = require('../middleware/auth');

const VALID_SERVICES = [
  'Dental Radiographs', 'Oral Surgery', 'Veneers', 'Tooth Sealant',
  'Fluoride Treatment', 'Braces / Orthodontic Treatment', 'Tooth Extraction',
  'Dental Restoration', 'Crowns / Caps', 'Fixed Partial Dentures (FPD)',
  'Dentures', 'Oral Prophylaxis / Cleaning', 'Root Canal Therapy (RCT)', 'Oral Check-up'
];

// GET /api/appointments
router.get('/', protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, from, to, patientId, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};

    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    } else if (patientId) {
      query.patient = patientId;
    } else if (search) {
      const matchingPatients = await Patient.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName:  { $regex: search, $options: 'i' } },
          { email:     { $regex: search, $options: 'i' } },
        ],
      }).select('_id');
      query.patient = { $in: matchingPatients.map(p => p._id) };
    }

    if (status) query.status = status;
    if (from || to) {
      query.appointmentDate = {};
      if (from) query.appointmentDate.$gte = new Date(from);
      if (to)   query.appointmentDate.$lte = new Date(to + 'T23:59:59.999');
    }

    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .populate('patient', 'firstName lastName email phone')
        .populate('dentist', 'firstName lastName')
        .sort({ appointmentDate: 1, 'timeSlot.start': 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Appointment.countDocuments(query)
    ]);

    res.json({ success: true, data: appointments, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/appointments
router.post('/', protect, [
  body('service').isIn(VALID_SERVICES).withMessage('Invalid service type.'),
  body('appointmentDate').isISO8601().withMessage('Valid appointment date is required.'),
  body('timeSlot.start').notEmpty().withMessage('Start time is required.'),
  body('symptoms').optional().isLength({ max: 500 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { service, appointmentDate, timeSlot, symptoms, priority, notes } = req.body;
    const date = new Date(appointmentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date < today) {
      return res.status(400).json({ success: false, message: 'Appointment date cannot be in the past.' });
    }

    const conflict = await Appointment.findOne({
      appointmentDate: { $gte: new Date(date.setHours(0, 0, 0, 0)), $lte: new Date(date.setHours(23, 59, 59, 999)) },
      'timeSlot.start': timeSlot.start,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (conflict) {
      return res.status(409).json({ success: false, message: 'This time slot is already booked. Please choose another.' });
    }

    const patientRecord = await Patient.findOne({ user: req.user.id });
    const appointment = await Appointment.create({
      patient: req.user.id,
      patientRecord: patientRecord?._id,
      service,
      appointmentDate: new Date(req.body.appointmentDate),
      timeSlot,
      symptoms,
      priority: priority || 'routine',
      notes,
      status: 'pending',
      createdBy: req.user.id
    });

    res.status(201).json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
});

// GET /api/appointments/available-slots
router.get('/available-slots', protect, async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'Date is required.' });

    const allSlots = [
      '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
    ];

    const d = new Date(date);
    const booked = await Appointment.find({
      appointmentDate: { $gte: new Date(d.setHours(0, 0, 0, 0)), $lte: new Date(d.setHours(23, 59, 59, 999)) },
      status: { $in: ['pending', 'confirmed'] }
    }).select('timeSlot');

    const bookedTimes = booked.map(a => a.timeSlot.start);
    const available = allSlots.filter(slot => !bookedTimes.includes(slot));

    res.json({ success: true, data: available });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/appointments/:id/status
router.patch('/:id/status', protect, authorize('staff', 'admin'), [
  body('status').isIn(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']).withMessage('Invalid status.')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { status, cancelReason, treatmentSummary } = req.body;
    const update = { status };
    const now = new Date();

    if (status === 'confirmed') update.confirmedAt = now;
    if (status === 'completed') { update.completedAt = now; if (treatmentSummary) update.treatmentSummary = treatmentSummary; }
    if (status === 'cancelled') { update.cancelledAt = now; if (cancelReason) update.cancelReason = cancelReason; }

    const appointment = await Appointment.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('patient', 'firstName lastName email');

    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });

    res.json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/appointments/:id  (patient cancels own)
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });

    if (req.user.role === 'patient' && appointment.patient.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    if (['completed', 'cancelled'].includes(appointment.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel this appointment.' });
    }

    appointment.status = 'cancelled';
    appointment.cancelledAt = new Date();
    appointment.cancelReason = req.body.reason || 'Cancelled by patient';
    await appointment.save();

    res.json({ success: true, message: 'Appointment cancelled.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
