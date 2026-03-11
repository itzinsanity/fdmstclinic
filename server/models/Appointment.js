'use strict';

const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  patientRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient'
  },
  dentist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  service: {
    type: String,
    required: [true, 'Service type is required.'],
    enum: [
      'Dental Radiographs',
      'Oral Surgery',
      'Veneers',
      'Tooth Sealant',
      'Fluoride Treatment',
      'Braces / Orthodontic Treatment',
      'Tooth Extraction',
      'Dental Restoration',
      'Crowns / Caps',
      'Fixed Partial Dentures (FPD)',
      'Dentures',
      'Oral Prophylaxis / Cleaning',
      'Root Canal Therapy (RCT)',
      'Oral Check-up'
    ]
  },
  appointmentDate: {
    type: Date,
    required: [true, 'Appointment date is required.']
  },
  timeSlot: {
    start: { type: String, required: true },
    end: { type: String }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['routine', 'urgent', 'emergency'],
    default: 'routine'
  },
  symptoms: {
    type: String,
    maxlength: [500, 'Symptoms description cannot exceed 500 characters.']
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters.']
  },
  treatmentSummary: {
    type: String,
    maxlength: [2000, 'Treatment summary cannot exceed 2000 characters.']
  },
  cancelReason: {
    type: String
  },
  confirmedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  fee: {
    type: Number,
    default: 0,
    min: [0, 'Fee cannot be negative.']
  },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true
});

AppointmentSchema.index({ appointmentDate: 1, status: 1 });
AppointmentSchema.index({ patient: 1, status: 1 });

module.exports = mongoose.model('Appointment', AppointmentSchema);
