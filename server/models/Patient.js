'use strict';

const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  patientId: {
    type: String,
    unique: true
  },
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'],
    default: 'unknown'
  },
  allergies: [{
    type: String,
    trim: true
  }],
  currentMedications: [{
    name: { type: String, trim: true },
    dosage: { type: String, trim: true }
  }],
  medicalConditions: [{
    type: String,
    trim: true
  }],
  emergencyContact: {
    name: { type: String, trim: true },
    relationship: { type: String, trim: true },
    phone: { type: String, trim: true }
  },
  dentalHistory: {
    lastVisit: Date,
    previousDentist: String,
    chiefComplaint: String,
    notes: String
  },
  insuranceInfo: {
    provider: String,
    policyNumber: String,
    groupNumber: String
  },
  registrationStatus: {
    type: String,
    enum: ['pending', 'approved', 'suspended'],
    default: 'approved'
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters.']
  },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true
});

PatientSchema.pre('save', async function (next) {
  if (this.isNew && !this.patientId) {
    const count = await this.constructor.countDocuments();
    this.patientId = `FD-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Patient', PatientSchema);
