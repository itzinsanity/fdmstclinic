'use strict';

const express = require('express');
const router  = express.Router();
const { body, validationResult } = require('express-validator');
const Subscriber  = require('../models/Subscriber');
const Promotion   = require('../models/Promotion');
const { protect, authorize } = require('../middleware/auth');

/* ─────────────────────────────────────────────
   PUBLIC — Subscriber sign-up (no auth needed)
   ───────────────────────────────────────────── */

// POST /api/promotions/subscribe
router.post('/subscribe', [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
  body('phone').optional().trim(),
  body('services').optional().isArray()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, email, phone, services } = req.body;

    // Upsert: if email already exists, update their preferences
    const subscriber = await Subscriber.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        name: name.trim(),
        phone: phone?.trim() || '',
        services: Array.isArray(services) ? services : [],
        isActive: true,
        isDeleted: false,
        deletedAt: null,
        source: 'landing_page'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      success: true,
      message: 'You have been subscribed for exclusive deals and promotions.',
      data: { id: subscriber._id }
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   ADMIN — Subscriber management
   ───────────────────────────────────────────── */

// GET /api/promotions/subscribers
router.get('/subscribers', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const query = { isDeleted: { $ne: true } };

    if (status === 'active')   query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const [subscribers, total] = await Promise.all([
      Subscriber.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Subscriber.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: subscribers,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/promotions/subscriber-stats  — service interest breakdown
router.get('/subscriber-stats', protect, authorize('admin'), async (req, res, next) => {
  try {
    const totalSubscribers  = await Subscriber.countDocuments({ isDeleted: { $ne: true } });
    const activeSubscribers = await Subscriber.countDocuments({ isDeleted: { $ne: true }, isActive: true });

    // Aggregate service interest counts
    const serviceInterest = await Subscriber.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $unwind: { path: '$services', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$services', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Monthly growth: subscribers joined per month (current year)
    const year = new Date().getFullYear();
    const monthlyGrowth = await Subscriber.aggregate([
      { $match: { isDeleted: { $ne: true }, createdAt: { $gte: new Date(year, 0, 1), $lte: new Date(year, 11, 31, 23, 59, 59) } } },
      { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 } } },
      { $sort: { '_id': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        totalSubscribers,
        activeSubscribers,
        serviceInterest,
        monthlyGrowth
      }
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/promotions/subscribers/:id  — toggle active status
router.patch('/subscribers/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { isActive } = req.body;
    const subscriber = await Subscriber.findByIdAndUpdate(
      req.params.id,
      { isActive: Boolean(isActive) },
      { new: true }
    );
    if (!subscriber) return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    res.json({ success: true, data: subscriber });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/promotions/subscribers/:id  — soft delete
router.delete('/subscribers/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const subscriber = await Subscriber.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user.id },
      { new: true }
    );
    if (!subscriber) return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    res.json({ success: true, message: 'Subscriber removed.' });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   ADMIN — Promotions CRUD
   ───────────────────────────────────────────── */

// GET /api/promotions
router.get('/', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const query = { isDeleted: { $ne: true } };

    if (status === 'active')   query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    const [promotions, total] = await Promise.all([
      Promotion.find(query)
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Promotion.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: promotions,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/promotions
router.post('/', protect, authorize('admin'), [
  body('title').trim().notEmpty().withMessage('Promotion title is required.'),
  body('validFrom').optional().isISO8601(),
  body('validTo').optional().isISO8601()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { title, description, badgeText, targetServices, validFrom, validTo, isActive } = req.body;
    const promo = await Promotion.create({
      title,
      description,
      badgeText,
      targetServices: Array.isArray(targetServices) ? targetServices : [],
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validTo: validTo ? new Date(validTo) : null,
      isActive: isActive !== false,
      createdBy: req.user.id
    });
    res.status(201).json({ success: true, data: promo });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/promotions/:id
router.patch('/:id', protect, authorize('admin'), [
  body('title').optional().trim().notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const allowed = ['title', 'description', 'badgeText', 'targetServices', 'validFrom', 'validTo', 'isActive'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const promo = await Promotion.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!promo) return res.status(404).json({ success: false, message: 'Promotion not found.' });
    res.json({ success: true, data: promo });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/promotions/:id  — soft delete
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const promo = await Promotion.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user.id },
      { new: true }
    );
    if (!promo) return res.status(404).json({ success: false, message: 'Promotion not found.' });
    res.json({ success: true, message: 'Promotion deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
