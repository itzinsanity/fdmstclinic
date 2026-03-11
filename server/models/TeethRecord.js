'use strict';

const mongoose = require('mongoose');

const FDI_TEETH = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48
];

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

const TeethRecordSchema = new mongoose.Schema({
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
        enum: ['healthy', 'decayed', 'filled', 'missing', 'crowned', 'implant', 'bridge', 'veneer', 'needs_treatment'],
        default: 'healthy'
      },
      notes: { type: String, default: '' }
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

TeethRecordSchema.pre('save', function (next) {
  this.lastUpdated = new Date();
  // Auto-initialize all 32 FDI teeth on new documents
  if (this.isNew && (!this.dentalChart || this.dentalChart.size === 0)) {
    if (!this.dentalChart) this.dentalChart = new Map();
    FDI_TEETH.forEach(num => {
      if (!this.dentalChart.has(String(num))) {
        this.dentalChart.set(String(num), { condition: 'healthy', notes: '' });
      }
    });
  }
  next();
});

module.exports = mongoose.model('TeethRecord', TeethRecordSchema);
