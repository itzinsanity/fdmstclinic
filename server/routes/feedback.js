'use strict';

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// GET /api/feedback (admin/staff — with sort, rating filter, search, pagination)
router.get('/', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, sort = 'recent', rating, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { isPublished: true, isDeleted: { $ne: true } };

    // Filter by rating
    if (rating) query.overallRating = parseInt(rating);

    // Search by patient name
    if (search) {
      const matchingUsers = await User.find({
        role: 'patient',
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.patient = { $in: matchingUsers.map(u => u._id) };
    }

    // Sort options
    let sortObj = {};
    if (sort === 'highest') sortObj = { overallRating: -1, createdAt: -1 };
    else if (sort === 'lowest') sortObj = { overallRating: 1, createdAt: -1 };
    else sortObj = { createdAt: -1 }; // recent (default)

    const [feedbacks, total] = await Promise.all([
      Feedback.find(query)
        .populate('patient', 'firstName lastName')
        .populate('appointment', 'service appointmentDate')
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit)),
      Feedback.countDocuments(query)
    ]);

    const stats = await Feedback.aggregate([
      { $match: { isPublished: true, isDeleted: { $ne: true } } },
      { $group: {
        _id: null,
        avgOverall: { $avg: '$overallRating' },
        avgStaff: { $avg: '$staffRating' },
        avgFacilities: { $avg: '$facilitiesRating' },
        avgWaitTime: { $avg: '$waitTimeRating' },
        avgService: { $avg: '$serviceRating' },
        count: { $sum: 1 },
        wouldRecommend: { $sum: { $cond: ['$wouldRecommend', 1, 0] } }
      }}
    ]);

    res.json({ success: true, data: feedbacks, total, stats: stats[0] || {}, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/feedback
router.post('/', protect, authorize('patient'), [
  body('overallRating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5.'),
  body('staffRating').optional().isInt({ min: 1, max: 5 }),
  body('facilitiesRating').optional().isInt({ min: 1, max: 5 }),
  body('waitTimeRating').optional().isInt({ min: 1, max: 5 }),
  body('serviceRating').optional().isInt({ min: 1, max: 5 }),
  body('comment').optional().isLength({ max: 1000 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const feedback = await Feedback.create({ ...req.body, patient: req.user.id });
    res.status(201).json({ success: true, data: feedback });
  } catch (err) {
    next(err);
  }
});

// POST /api/feedback/:id/respond (admin)
router.post('/:id/respond', protect, authorize('admin'), [
  body('message').trim().notEmpty().withMessage('Response message is required.')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      { adminResponse: { message: req.body.message, respondedBy: req.user.id, respondedAt: new Date() } },
      { new: true }
    );
    if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found.' });
    res.json({ success: true, data: feedback });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/feedback/:id (admin — soft delete)
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user.id },
      { new: true }
    );
    if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found.' });
    res.json({ success: true, message: 'Feedback moved to trash.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
