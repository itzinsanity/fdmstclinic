'use strict';

const mongoose = require('mongoose');

const SubscriberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required.'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters.']
  },
  email: {
    type: String,
    required: [true, 'Email is required.'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address.']
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  services: [{
    type: String,
    trim: true
  }],
  source: {
    type: String,
    default: 'landing_page'
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
  }
}, {
  timestamps: true
});

SubscriberSchema.index({ isActive: 1, isDeleted: 1 });

module.exports = mongoose.model('Subscriber', SubscriberSchema);
