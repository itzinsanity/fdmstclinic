'use strict';

const mongoose = require('mongoose');

const PromotionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Promotion title is required.'],
    trim: true,
    maxlength: [150, 'Title cannot exceed 150 characters.']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters.'],
    default: ''
  },
  badgeText: {
    type: String,
    trim: true,
    maxlength: [30, 'Badge text cannot exceed 30 characters.'],
    default: ''
  },
  targetServices: [{
    type: String,
    trim: true
  }],
  validFrom: {
    type: Date,
    default: Date.now
  },
  validTo: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

PromotionSchema.index({ isActive: 1, isDeleted: 1 });

module.exports = mongoose.model('Promotion', PromotionSchema);
