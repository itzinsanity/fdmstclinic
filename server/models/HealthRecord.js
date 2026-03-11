'use strict';

const mongoose = require('mongoose');

const TreatmentEntrySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  service: { type: String, required: true },
  procedure: { type: String },
  teethInvolved: [{ type: String }],
  dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String, maxlength: 2000 },
  xrays: [{ filename: String, uploadedAt: Date }],
  nextVisitRecommended: Date
});

const HealthRecordSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    unique: true
  },
  patientUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dentalChart: {
    type: Map,
    of: new mongoose.Schema({
      condition: {
        type: String,
        enum: ['healthy', 'decayed', 'filled', 'missing', 'crowned', 'implant', 'needs_treatment'],
        default: 'healthy'
      },
      notes: String
    }, { _id: false })
  },
  periodontalStatus: {
    type: String,
    enum: ['healthy', 'mild_gingivitis', 'moderate_periodontitis', 'severe_periodontitis'],
    default: 'healthy'
  },
  oralHygieneRating: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor'],
    default: 'good'
  },
  treatmentHistory: [TreatmentEntrySchema],
  xrayHistory: [{
    filename: String,
    type: { type: String, enum: ['periapical', 'panoramic', 'bitewing', 'occlusal', 'other'] },
    date: Date,
    notes: String
  }],
  allergiesNotes: String,
  pharmacyNotes: String,
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true
});

HealthRecordSchema.pre('save', function (next) {
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('HealthRecord', HealthRecordSchema);
