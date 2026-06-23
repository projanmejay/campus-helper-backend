const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Models
const RideRequest = require('../models/RideRequest');
const RideGroup = require('../models/RideGroup');
const TaxiSetting = require('../models/TaxiSetting');

// Middleware
const { authenticate } = require('../middleware/auth');

// Admin JWT middleware (the Admin app logs in via /admin/login which returns a JWT with { admin: true })
function adminJwtAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

/* ===================================================== */
/* ================= STUDENT APP ROUTES ================ */
/* ===================================================== */

// Create a new ride request
router.post('/request', authenticate, async (req, res) => {
  try {
    const { pickup, destination, rideDate, rideTime, passengerCount, contactNumber } = req.body;

    if (!pickup || !destination || !rideDate || !rideTime || !passengerCount || !contactNumber) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Fetch current settings to get booking advance amount
    let settings = await TaxiSetting.findOne();
    if (!settings) {
      settings = await TaxiSetting.create({}); // Create defaults
    }

    const bookingAmountPaid = settings.bookingAdvance * Number(passengerCount);

    const request = await RideRequest.create({
      userId: req.user.userId,
      pickup,
      destination,
      rideDate,
      rideTime,
      passengerCount: Number(passengerCount),
      contactNumber,
      bookingAmountPaid,
      status: 'PENDING_GROUPING'
    });

    res.status(201).json({ success: true, requestId: request._id, bookingAmountPaid });
  } catch (err) {
    console.error('CREATE RIDE REQUEST ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's ride requests
router.get('/my-requests', authenticate, async (req, res) => {
  try {
    const requests = await RideRequest.find({ userId: req.user.userId })
      .populate('groupId')
      .sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (err) {
    console.error('GET MY RIDE REQUESTS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Pay final amount (marks as CONFIRMED)
router.post('/pay-final', authenticate, async (req, res) => {
  try {
    const { requestId } = req.body;

    const request = await RideRequest.findOne({ _id: requestId, userId: req.user.userId });
    if (!request) return res.status(404).json({ error: 'Ride request not found' });

    if (request.status !== 'AWAITING_FINAL_PAYMENT') {
      return res.status(400).json({ error: `Ride is not awaiting final payment (current status: ${request.status})` });
    }

    request.status = 'CONFIRMED';
    await request.save();

    // Also update passenger status in the RideGroup
    if (request.groupId) {
      const group = await RideGroup.findById(request.groupId);
      if (group) {
        const passenger = group.passengers.find(p => p.requestId.toString() === request._id.toString());
        if (passenger) {
          passenger.status = 'CONFIRMED';
          await group.save();
        }
      }
    }

    res.json({ success: true, message: 'Payment successful, ride confirmed.' });
  } catch (err) {
    console.error('PAY FINAL AMOUNT ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ===================================================== */
/* ================ TAXI OWNER ROUTES ================== */
/* ===================================================== */

// Get all ride groups (Taxi Owner sees this — no auth required, similar to existing pattern)
router.get('/groups', async (req, res) => {
  try {
    const groups = await RideGroup.find()
      .sort({ rideDate: 1, rideTime: 1 });
    res.json({ success: true, groups });
  } catch (err) {
    console.error('GET RIDE GROUPS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update group status (Start trip, Complete trip, Cancel)
router.patch('/groups/:groupId/status', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { status } = req.body;

    const validStatuses = ['UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const group = await RideGroup.findByIdAndUpdate(groupId, { status }, { new: true });
    if (!group) return res.status(404).json({ error: 'Ride group not found' });

    res.json({ success: true, group });
  } catch (err) {
    console.error('UPDATE GROUP STATUS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ===================================================== */
/* ================== ADMIN ROUTES ===================== */
/* ===================================================== */

// Get taxi settings — Admin JWT auth
router.get('/settings', adminJwtAuthenticate, async (req, res) => {
  try {
    let settings = await TaxiSetting.findOne();
    if (!settings) {
      settings = await TaxiSetting.create({});
    }
    res.json({ success: true, settings });
  } catch (err) {
    console.error('GET TAXI SETTINGS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update taxi settings — Admin JWT auth
router.put('/settings', adminJwtAuthenticate, async (req, res) => {
  try {
    const updateData = req.body;
    let settings = await TaxiSetting.findOne();

    if (!settings) {
      settings = await TaxiSetting.create(updateData);
    } else {
      settings = await TaxiSetting.findOneAndUpdate({}, updateData, { new: true, runValidators: true });
    }

    res.json({ success: true, settings });
  } catch (err) {
    console.error('UPDATE TAXI SETTINGS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
