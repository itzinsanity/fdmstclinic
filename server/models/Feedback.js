'use strict';

const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  overallRating: {
    type: Number,
    required: [true, 'Overall rating is required.'],
    min: [1, 'Rating must be at least 1.'],
    max: [5, 'Rating cannot exceed 5.']
  },
  staffRating: {
    type: Number,
    min: 1,
    max: 5
  },
  facilitiesRating: {
    type: Number,
    min: 1,
    max: 5
  },
  waitTimeRating: {
    type: Number,
    min: 1,
    max: 5
  },
  serviceRating: {
    type: Number,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    maxlength: [1000, 'Comment cannot exceed 1000 characters.'],
    trim: true
  },
  wouldRecommend: {
    type: Boolean
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  adminResponse: {
    message: String,
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    respondedAt: Date
  },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true
});

FeedbackSchema.index({ patient: 1, appointment: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Feedback', FeedbackSchema);
