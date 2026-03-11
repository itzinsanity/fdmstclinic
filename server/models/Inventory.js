'use strict';

const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Item name is required.'],
    trim: true,
    maxlength: [100, 'Item name cannot exceed 100 characters.']
  },
  category: {
    type: String,
    required: [true, 'Category is required.'],
    enum: [
      'Anesthetics',
      'Restorative Materials',
      'Diagnostic Tools',
      'Surgical Instruments',
      'Sterilization Supplies',
      'PPE',
      'Impression Materials',
      'Orthodontic Supplies',
      'Radiography Supplies',
      'Infection Control',
      'Office Supplies',
      'Other'
    ],
    default: 'Other'
  },
  sku: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required.'],
    min: [0, 'Quantity cannot be negative.']
  },
  unit: {
    type: String,
    default: 'piece',
    trim: true
  },
  minimumStock: {
    type: Number,
    default: 5,
    min: 0
  },
  reorderPoint: {
    type: Number,
    default: 10,
    min: 0
  },
  unitCost: {
    type: Number,
    min: 0,
    default: 0
  },
  supplier: {
    name: String,
    contact: String,
    email: String
  },
  expiryDate: Date,
  location: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    maxlength: 500
  },
  lastRestockedAt: Date,
  lastRestockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  transactionLog: [{
    action: { type: String, enum: ['restock', 'use', 'adjustment', 'disposal'] },
    quantity: Number,
    previousQuantity: Number,
    newQuantity: Number,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    date: { type: Date, default: Date.now }
  }],
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true
});

InventoryItemSchema.virtual('isLowStock').get(function () {
  return this.quantity <= this.reorderPoint;
});

InventoryItemSchema.virtual('isCritical').get(function () {
  return this.quantity <= this.minimumStock;
});

InventoryItemSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Inventory', InventoryItemSchema);
