'use strict';

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Inventory = require('../models/Inventory');
const { protect, authorize } = require('../middleware/auth');

// GET /api/inventory
router.get('/', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const { category, lowStock, search, page = 1, limit = 30 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = { isActive: true, isDeleted: { $ne: true } };

    if (category) query.category = category;
    if (search) query.name = { $regex: search, $options: 'i' };

    let items = await Inventory.find(query)
      .populate('lastRestockedBy', 'firstName lastName')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    if (lowStock === 'true') {
      items = items.filter(i => i.quantity <= i.reorderPoint);
    }

    const total = await Inventory.countDocuments(query);
    const summary = await Inventory.aggregate([
      { $match: { isActive: true, isDeleted: { $ne: true } } },
      { $group: {
        _id: null,
        totalItems: { $sum: 1 },
        totalValue: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
        lowStockCount: { $sum: { $cond: [{ $lte: ['$quantity', '$reorderPoint'] }, 1, 0] } },
        criticalCount: { $sum: { $cond: [{ $lte: ['$quantity', '$minimumStock'] }, 1, 0] } }
      }}
    ]);

    res.json({ success: true, data: items, total, summary: summary[0] || {}, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory
router.post('/', protect, authorize('staff', 'admin'), [
  body('name').trim().notEmpty().withMessage('Item name is required.'),
  body('category').notEmpty().withMessage('Category is required.'),
  body('quantity').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer.'),
  body('unitCost').optional().isFloat({ min: 0 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const item = await Inventory.create({ ...req.body, lastRestockedBy: req.user.id, lastRestockedAt: new Date() });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/inventory/:id/adjust
router.patch('/:id/adjust', protect, authorize('staff', 'admin'), [
  body('action').isIn(['restock', 'use', 'adjustment', 'disposal']).withMessage('Invalid action.'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1.')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const prev = item.quantity;
    const { action, quantity, notes } = req.body;

    if (action === 'restock') {
      item.quantity += parseInt(quantity);
      item.lastRestockedAt = new Date();
      item.lastRestockedBy = req.user.id;
    } else if (['use', 'disposal'].includes(action)) {
      if (item.quantity < parseInt(quantity)) {
        return res.status(400).json({ success: false, message: 'Insufficient stock.' });
      }
      item.quantity -= parseInt(quantity);
    } else {
      item.quantity = parseInt(quantity);
    }

    item.transactionLog.push({
      action, quantity: parseInt(quantity),
      previousQuantity: prev, newQuantity: item.quantity,
      performedBy: req.user.id, notes
    });

    await item.save();
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

// PUT /api/inventory/:id
router.put('/:id', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const allowed = ['name', 'category', 'unit', 'minimumStock', 'reorderPoint', 'unitCost', 'supplier', 'expiryDate', 'location', 'notes'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const item = await Inventory.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/inventory/:id (soft delete to trash)
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const item = await Inventory.findByIdAndUpdate(req.params.id, {
      isActive: false,
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user.id
    }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
    res.json({ success: true, message: 'Item moved to trash.' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/inventory/:id/restore (admin only)
router.patch('/:id/restore', protect, authorize('admin'), async (req, res, next) => {
  try {
    const item = await Inventory.findByIdAndUpdate(req.params.id, {
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null
    }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
    res.json({ success: true, data: item, message: 'Item restored.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
