'use strict';

const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Feedback = require('../models/Feedback');
const Inventory = require('../models/Inventory');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const MODELS = {
  feedback: Feedback,
  appointments: Appointment,
  inventory: Inventory,
  patients: Patient
};

// GET /api/trash?type=feedback|appointments|inventory|patients&page=1
router.get('/', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    if (!type || !MODELS[type]) {
      return res.status(400).json({ success: false, message: 'Valid type required: feedback, appointments, inventory, patients' });
    }

    const Model = MODELS[type];
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = { isDeleted: true };

    let populate = [];
    if (type === 'feedback') populate = [{ path: 'patient', select: 'firstName lastName email' }, { path: 'deletedBy', select: 'firstName lastName' }];
    if (type === 'appointments') populate = [{ path: 'patient', select: 'firstName lastName email' }, { path: 'deletedBy', select: 'firstName lastName' }];
    if (type === 'inventory') populate = [{ path: 'deletedBy', select: 'firstName lastName' }];
    if (type === 'patients') populate = [{ path: 'user', select: 'firstName lastName email' }, { path: 'deletedBy', select: 'firstName lastName' }];

    let queryBuilder = Model.find(query).sort({ deletedAt: -1 }).skip(skip).limit(parseInt(limit));
    populate.forEach(p => { queryBuilder = queryBuilder.populate(p.path, p.select); });

    const [items, total] = await Promise.all([
      queryBuilder,
      Model.countDocuments(query)
    ]);

    res.json({ success: true, data: items, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/trash/restore — restore a single item
router.post('/restore', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { type, id } = req.body;
    if (!type || !id || !MODELS[type]) {
      return res.status(400).json({ success: false, message: 'Valid type and id required.' });
    }

    const Model = MODELS[type];
    const update = { isDeleted: false, deletedAt: null, deletedBy: null };

    // Inventory: also re-activate
    if (type === 'inventory') update.isActive = true;

    const item = await Model.findByIdAndUpdate(id, update, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    // If patients: also re-activate the User account
    if (type === 'patients') {
      await User.findByIdAndUpdate(item.user, { isActive: true });
    }

    res.json({ success: true, message: `${type.slice(0, -1)} restored successfully.`, data: item });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/trash/purge — hard delete single item
router.delete('/purge', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { type, id } = req.body;
    if (!type || !id || !MODELS[type]) {
      return res.status(400).json({ success: false, message: 'Valid type and id required.' });
    }

    const Model = MODELS[type];
    const item = await Model.findOneAndDelete({ _id: id, isDeleted: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found in trash.' });

    res.json({ success: true, message: 'Item permanently deleted.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/trash/purge-all — hard delete ALL deleted items of a type
router.delete('/purge-all', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { type } = req.body;
    if (!type || !MODELS[type]) {
      return res.status(400).json({ success: false, message: 'Valid type required.' });
    }

    const Model = MODELS[type];
    const result = await Model.deleteMany({ isDeleted: true });

    res.json({ success: true, message: `${result.deletedCount} item(s) permanently deleted.`, deletedCount: result.deletedCount });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
