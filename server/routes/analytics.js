'use strict';

const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const Feedback = require('../models/Feedback');
const { protect, authorize } = require('../middleware/auth');

// GET /api/analytics/overview
router.get('/overview', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000 - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      totalPatients, newPatientsThisMonth, newPatientsLastMonth,
      totalAppointments, appointmentsToday, appointmentsThisMonth,
      pendingCount, confirmedCount, completedCount, cancelledCount,
      lowStockItems, inventoryValue, avgRating
    ] = await Promise.all([
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({ role: 'patient', createdAt: { $gte: monthStart } }),
      User.countDocuments({ role: 'patient', createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
      Appointment.countDocuments({ isDeleted: { $ne: true } }),
      Appointment.countDocuments({ appointmentDate: { $gte: todayStart, $lte: todayEnd }, isDeleted: { $ne: true } }),
      Appointment.countDocuments({ appointmentDate: { $gte: monthStart }, isDeleted: { $ne: true } }),
      Appointment.countDocuments({ status: 'pending', isDeleted: { $ne: true } }),
      Appointment.countDocuments({ status: 'confirmed', isDeleted: { $ne: true } }),
      Appointment.countDocuments({ status: 'completed', isDeleted: { $ne: true } }),
      Appointment.countDocuments({ status: 'cancelled', isDeleted: { $ne: true } }),
      Inventory.countDocuments({ isActive: true, isDeleted: { $ne: true }, $expr: { $lte: ['$quantity', '$reorderPoint'] } }),
      Inventory.aggregate([{ $match: { isActive: true, isDeleted: { $ne: true } } }, { $group: { _id: null, total: { $sum: { $multiply: ['$quantity', '$unitCost'] } } } }]),
      Feedback.aggregate([{ $match: { isDeleted: { $ne: true } } }, { $group: { _id: null, avg: { $avg: '$overallRating' } } }])
    ]);

    const patientGrowth = newPatientsLastMonth > 0
      ? (((newPatientsThisMonth - newPatientsLastMonth) / newPatientsLastMonth) * 100).toFixed(1)
      : 100;

    res.json({
      success: true,
      data: {
        patients: { total: totalPatients, thisMonth: newPatientsThisMonth, lastMonth: newPatientsLastMonth, growth: parseFloat(patientGrowth) },
        appointments: {
          total: totalAppointments, today: appointmentsToday, thisMonth: appointmentsThisMonth,
          byStatus: { pending: pendingCount, confirmed: confirmedCount, completed: completedCount, cancelled: cancelledCount }
        },
        inventory: { lowStock: lowStockItems, totalValue: inventoryValue[0]?.total || 0 },
        feedback: { avgRating: avgRating[0] ? parseFloat(avgRating[0].avg.toFixed(2)) : null }
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/appointments-trend
router.get('/appointments-trend', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const { period = 'monthly', year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();

    let groupBy, dateRange;
    if (period === 'daily') {
      const start = new Date(targetYear, new Date().getMonth(), 1);
      const end = new Date(targetYear, new Date().getMonth() + 1, 0, 23, 59, 59);
      dateRange = { $gte: start, $lte: end };
      groupBy = { day: { $dayOfMonth: '$appointmentDate' }, month: { $month: '$appointmentDate' } };
    } else if (period === 'weekly') {
      const start = new Date(targetYear, 0, 1);
      const end = new Date(targetYear, 11, 31, 23, 59, 59);
      dateRange = { $gte: start, $lte: end };
      groupBy = { week: { $week: '$appointmentDate' } };
    } else {
      dateRange = { $gte: new Date(targetYear, 0, 1), $lte: new Date(targetYear, 11, 31, 23, 59, 59) };
      groupBy = { month: { $month: '$appointmentDate' } };
    }

    const trend = await Appointment.aggregate([
      { $match: { appointmentDate: dateRange, isDeleted: { $ne: true } } },
      { $group: {
        _id: groupBy,
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } }
      }},
      { $sort: { '_id.month': 1, '_id.day': 1, '_id.week': 1 } }
    ]);

    res.json({ success: true, data: trend, period, year: targetYear });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/services-breakdown
router.get('/services-breakdown', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const { year, status } = req.query;
    const matchQuery = { isDeleted: { $ne: true } };
    if (year) {
      matchQuery.appointmentDate = {
        $gte: new Date(parseInt(year), 0, 1),
        $lte: new Date(parseInt(year), 11, 31, 23, 59, 59)
      };
    }
    if (status) matchQuery.status = status;

    const breakdown = await Appointment.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$service', count: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
      }},
      { $sort: { count: -1 } }
    ]);

    res.json({ success: true, data: breakdown });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/patient-demographics
router.get('/patient-demographics', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const users = await User.find({ role: 'patient' }).select('gender dateOfBirth createdAt');

    const genderDist = { male: 0, female: 0, other: 0, prefer_not_to_say: 0, unknown: 0 };
    const ageGroups = { 'Under 18': 0, '18-29': 0, '30-39': 0, '40-49': 0, '50-59': 0, '60+': 0 };
    const registrationByMonth = Array(12).fill(0);
    const now = new Date();

    users.forEach(u => {
      genderDist[u.gender || 'unknown'] = (genderDist[u.gender || 'unknown'] || 0) + 1;

      if (u.dateOfBirth) {
        const age = Math.floor((now - new Date(u.dateOfBirth)) / (365.25 * 24 * 3600 * 1000));
        if (age < 18) ageGroups['Under 18']++;
        else if (age < 30) ageGroups['18-29']++;
        else if (age < 40) ageGroups['30-39']++;
        else if (age < 50) ageGroups['40-49']++;
        else if (age < 60) ageGroups['50-59']++;
        else ageGroups['60+']++;
      }

      if (u.createdAt && new Date(u.createdAt).getFullYear() === now.getFullYear()) {
        registrationByMonth[new Date(u.createdAt).getMonth()]++;
      }
    });

    res.json({ success: true, data: { genderDist, ageGroups, registrationByMonth, total: users.length } });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/inventory-summary
router.get('/inventory-summary', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const byCategoryRaw = await Inventory.aggregate([
      { $match: { isActive: true, isDeleted: { $ne: true } } },
      { $group: {
        _id: '$category',
        totalItems: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
        totalValue: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
        lowStock: { $sum: { $cond: [{ $lte: ['$quantity', '$reorderPoint'] }, 1, 0] } }
      }},
      { $sort: { totalValue: -1 } }
    ]);

    const expiringSoon = await Inventory.find({
      isActive: true, isDeleted: { $ne: true },
      expiryDate: { $lte: new Date(Date.now() + 30 * 86400000), $gte: new Date() }
    }).select('name expiryDate quantity category').sort({ expiryDate: 1 });

    res.json({ success: true, data: { byCategory: byCategoryRaw, expiringSoon } });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/feedback-summary
router.get('/feedback-summary', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const baseMatch = { isPublished: true, isDeleted: { $ne: true } };

    const ratingDist = await Feedback.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$overallRating', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const monthlyAvg = await Feedback.aggregate([
      { $match: baseMatch },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        avg: { $avg: '$overallRating' },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 }
    ]);

    const recommendRate = await Feedback.aggregate([
      { $match: { ...baseMatch, wouldRecommend: { $ne: null } } },
      { $group: {
        _id: null,
        yes: { $sum: { $cond: ['$wouldRecommend', 1, 0] } },
        total: { $sum: 1 }
      }}
    ]);

    res.json({ success: true, data: { ratingDist, monthlyAvg, recommendRate: recommendRate[0] || {} } });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/appointments-today
router.get('/appointments-today', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 86400000 - 1);

    const appointments = await Appointment.find({
      appointmentDate: { $gte: start, $lte: end },
      isDeleted: { $ne: true }
    })
      .populate('patient', 'firstName lastName phone')
      .sort({ 'timeSlot.start': 1 });

    const total     = appointments.length;
    const pending   = appointments.filter(a => a.status === 'pending').length;
    const confirmed = appointments.filter(a => a.status === 'confirmed').length;

    res.json({ success: true, data: { appointments, total, pending, confirmed } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// BAM ANALYTICS — Revenue & Patient Behavior
// ============================================================

// GET /api/analytics/revenue-kpis
router.get('/revenue-kpis', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [totalRev, monthRev, lastMonthRev, topService, avgRev] = await Promise.all([
      Appointment.aggregate([
        { $match: { status: 'completed', isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$fee' }, count: { $sum: 1 } } }
      ]),
      Appointment.aggregate([
        { $match: { status: 'completed', isDeleted: { $ne: true }, completedAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$fee' } } }
      ]),
      Appointment.aggregate([
        { $match: { status: 'completed', isDeleted: { $ne: true }, completedAt: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
        { $group: { _id: null, total: { $sum: '$fee' } } }
      ]),
      Appointment.aggregate([
        { $match: { status: 'completed', isDeleted: { $ne: true } } },
        { $group: { _id: '$service', total: { $sum: '$fee' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 1 }
      ]),
      Appointment.aggregate([
        { $match: { status: 'completed', isDeleted: { $ne: true }, fee: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$fee' } } }
      ])
    ]);

    const totalRevData = totalRev[0] || { total: 0, count: 0 };
    const monthRevTotal = monthRev[0]?.total || 0;
    const lastMonthRevTotal = lastMonthRev[0]?.total || 0;
    const revenueGrowth = lastMonthRevTotal > 0
      ? (((monthRevTotal - lastMonthRevTotal) / lastMonthRevTotal) * 100).toFixed(1)
      : monthRevTotal > 0 ? 100 : 0;

    res.json({
      success: true,
      data: {
        totalRevenue: totalRevData.total,
        totalCompleted: totalRevData.count,
        monthlyRevenue: monthRevTotal,
        lastMonthRevenue: lastMonthRevTotal,
        revenueGrowth: parseFloat(revenueGrowth),
        avgRevenuePerVisit: avgRev[0] ? parseFloat(avgRev[0].avg.toFixed(2)) : 0,
        topService: topService[0] ? { name: topService[0]._id, revenue: topService[0].total, count: topService[0].count } : null
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/revenue-trend
router.get('/revenue-trend', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const { period = 'monthly', year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();

    let groupBy, dateRange;
    if (period === 'weekly') {
      dateRange = { $gte: new Date(targetYear, 0, 1), $lte: new Date(targetYear, 11, 31, 23, 59, 59) };
      groupBy = { week: { $week: '$completedAt' } };
    } else {
      dateRange = { $gte: new Date(targetYear, 0, 1), $lte: new Date(targetYear, 11, 31, 23, 59, 59) };
      groupBy = { month: { $month: '$completedAt' } };
    }

    const trend = await Appointment.aggregate([
      { $match: { status: 'completed', isDeleted: { $ne: true }, completedAt: dateRange } },
      { $group: {
        _id: groupBy,
        revenue: { $sum: '$fee' },
        count: { $sum: 1 },
        avgFee: { $avg: '$fee' }
      }},
      { $sort: { '_id.month': 1, '_id.week': 1 } }
    ]);

    res.json({ success: true, data: trend, period, year: targetYear });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/revenue-by-service
router.get('/revenue-by-service', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const { year } = req.query;
    const matchQuery = { status: 'completed', isDeleted: { $ne: true } };
    if (year) {
      matchQuery.completedAt = {
        $gte: new Date(parseInt(year), 0, 1),
        $lte: new Date(parseInt(year), 11, 31, 23, 59, 59)
      };
    }

    const breakdown = await Appointment.aggregate([
      { $match: matchQuery },
      { $group: {
        _id: '$service',
        totalRevenue: { $sum: '$fee' },
        count: { $sum: 1 },
        avgFee: { $avg: '$fee' }
      }},
      { $sort: { totalRevenue: -1 } }
    ]);

    res.json({ success: true, data: breakdown });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/peak-hours
router.get('/peak-hours', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const { year } = req.query;
    const matchQuery = { isDeleted: { $ne: true } };
    if (year) {
      matchQuery.appointmentDate = {
        $gte: new Date(parseInt(year), 0, 1),
        $lte: new Date(parseInt(year), 11, 31, 23, 59, 59)
      };
    }

    // Group by hour extracted from timeSlot.start string (e.g., "08:30" → 8)
    const allAppts = await Appointment.find(matchQuery).select('timeSlot.start appointmentDate status');
    const hourCounts = {};
    allAppts.forEach(a => {
      if (a.timeSlot && a.timeSlot.start) {
        const hour = parseInt(a.timeSlot.start.split(':')[0]);
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    });

    const result = Object.keys(hourCounts)
      .map(h => ({ hour: parseInt(h), label: `${h}:00`, count: hourCounts[h] }))
      .sort((a, b) => a.hour - b.hour);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/peak-days
router.get('/peak-days', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const { year } = req.query;
    const matchQuery = { isDeleted: { $ne: true } };
    if (year) {
      matchQuery.appointmentDate = {
        $gte: new Date(parseInt(year), 0, 1),
        $lte: new Date(parseInt(year), 11, 31, 23, 59, 59)
      };
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const result = await Appointment.aggregate([
      { $match: matchQuery },
      { $group: {
        _id: { $dayOfWeek: '$appointmentDate' }, // 1=Sun, 7=Sat
        count: { $sum: 1 },
        avgFee: { $avg: '$fee' }
      }},
      { $sort: { '_id': 1 } }
    ]);

    const data = result.map(r => ({
      dayOfWeek: r._id,
      day: dayNames[r._id - 1],
      count: r.count,
      avgFee: parseFloat((r.avgFee || 0).toFixed(2))
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/patient-behavior
router.get('/patient-behavior', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    // Count appointments per patient
    const apptPerPatient = await Appointment.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$patient', count: { $sum: 1 }, cancelCount: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } }
    ]);

    const newPatients = apptPerPatient.filter(p => p.count === 1).length;
    const returningPatients = apptPerPatient.filter(p => p.count > 1).length;
    const totalPatients = apptPerPatient.length;
    const avgAppointments = totalPatients > 0
      ? (apptPerPatient.reduce((s, p) => s + p.count, 0) / totalPatients).toFixed(2)
      : 0;

    const totalCancellations = apptPerPatient.reduce((s, p) => s + p.cancelCount, 0);
    const totalAppts = apptPerPatient.reduce((s, p) => s + p.count, 0);
    const cancellationRate = totalAppts > 0 ? ((totalCancellations / totalAppts) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        newPatients,
        returningPatients,
        totalPatients,
        avgAppointmentsPerPatient: parseFloat(avgAppointments),
        cancellationRate: parseFloat(cancellationRate),
        retentionRate: totalPatients > 0 ? parseFloat(((returningPatients / totalPatients) * 100).toFixed(1)) : 0
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/completion-funnel
router.get('/completion-funnel', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const [booked, confirmed, completed, feedbackCount] = await Promise.all([
      Appointment.countDocuments({ isDeleted: { $ne: true } }),
      Appointment.countDocuments({ status: { $in: ['confirmed', 'completed'] }, isDeleted: { $ne: true } }),
      Appointment.countDocuments({ status: 'completed', isDeleted: { $ne: true } }),
      Feedback.countDocuments({ isDeleted: { $ne: true } })
    ]);

    const funnel = [
      { stage: 'Booked', count: booked, rate: 100 },
      { stage: 'Confirmed', count: confirmed, rate: booked > 0 ? parseFloat(((confirmed / booked) * 100).toFixed(1)) : 0 },
      { stage: 'Completed', count: completed, rate: booked > 0 ? parseFloat(((completed / booked) * 100).toFixed(1)) : 0 },
      { stage: 'Left Feedback', count: feedbackCount, rate: completed > 0 ? parseFloat(((feedbackCount / completed) * 100).toFixed(1)) : 0 }
    ];

    res.json({ success: true, data: funnel });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/new-vs-returning
router.get('/new-vs-returning', protect, authorize('staff', 'admin'), async (req, res, next) => {
  try {
    const { year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();

    // Get first appointment date per patient
    const firstAppts = await Appointment.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $sort: { appointmentDate: 1 } },
      { $group: { _id: '$patient', firstDate: { $first: '$appointmentDate' } } }
    ]);

    // Map patientId → firstDate
    const firstDateMap = {};
    firstAppts.forEach(a => { firstDateMap[a._id.toString()] = a.firstDate; });

    // Get all appointments in target year
    const yearAppts = await Appointment.find({
      isDeleted: { $ne: true },
      appointmentDate: {
        $gte: new Date(targetYear, 0, 1),
        $lte: new Date(targetYear, 11, 31, 23, 59, 59)
      }
    }).select('patient appointmentDate');

    // Group by month: new = first ever appt in that month, returning = subsequent
    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, newPatients: 0, returningPatients: 0 }));

    yearAppts.forEach(a => {
      const month = new Date(a.appointmentDate).getMonth();
      const firstDate = firstDateMap[a.patient.toString()];
      const isNew = firstDate &&
        new Date(firstDate).getFullYear() === targetYear &&
        new Date(firstDate).getMonth() === month;

      if (isNew) monthly[month].newPatients++;
      else monthly[month].returningPatients++;
    });

    res.json({ success: true, data: monthly, year: targetYear });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
