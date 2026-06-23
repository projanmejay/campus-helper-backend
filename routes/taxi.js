const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Razorpay = require('razorpay');

// Models
const RideRequest = require('../models/RideRequest');
const RideGroup = require('../models/RideGroup');
const TaxiSetting = require('../models/TaxiSetting');

// Middleware
const { authenticate } = require('../middleware/auth');

// Razorpay instance
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Admin JWT middleware (Admin app logs in via /admin/login which returns a JWT with { admin: true })
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
/* ============= PUBLIC — LOCATIONS ==================== */
/* ===================================================== */

// Get pickup locations and destinations (public — student app needs this without auth)
router.get('/locations', async (req, res) => {
  try {
    let settings = await TaxiSetting.findOne();
    if (!settings) settings = await TaxiSetting.create({});
    res.json({
      success: true,
      pickupLocations: settings.pickupLocations,
      destinations: settings.destinations,
    });
  } catch (err) {
    console.error('GET TAXI LOCATIONS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ===================================================== */
/* ================= STUDENT APP ROUTES ================ */
/* ===================================================== */

// STEP 1 — Create a ride request (before payment, just stores the request)
router.post('/request', authenticate, async (req, res) => {
  try {
    const { pickup, destination, rideDate, rideTime, passengerCount, contactNumber } = req.body;

    if (!pickup || !destination || !rideDate || !rideTime || !passengerCount || !contactNumber) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    let settings = await TaxiSetting.findOne();
    if (!settings) settings = await TaxiSetting.create({});

    const bookingAdvance = settings.bookingAdvance * Number(passengerCount);

    const request = await RideRequest.create({
      userId: req.user.userId,
      pickup,
      destination,
      rideDate,
      rideTime,
      passengerCount: Number(passengerCount),
      contactNumber,
      bookingAmountPaid: 0, // Will be updated after payment
      status: 'PENDING_GROUPING',
    });

    // Create a Razorpay order for the booking advance
    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(bookingAdvance * 100), // paise
      currency: 'INR',
      receipt: `taxi_adv_${request._id}`,
    });

    res.status(201).json({
      success: true,
      requestId: request._id,
      bookingAdvance,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('CREATE RIDE REQUEST ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// STEP 2 — Verify booking advance payment
router.post('/verify-advance', authenticate, async (req, res) => {
  try {
    const { requestId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Verify signature
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const request = await RideRequest.findOne({ _id: requestId, userId: req.user.userId });
    if (!request) return res.status(404).json({ error: 'Ride request not found' });

    let settings = await TaxiSetting.findOne();
    if (!settings) settings = await TaxiSetting.create({});

    const bookingAmountPaid = settings.bookingAdvance * request.passengerCount;
    request.bookingAmountPaid = bookingAmountPaid;
    await request.save();

    res.json({ success: true, message: 'Booking advance paid. You are in the queue!' });
  } catch (err) {
    console.error('VERIFY ADVANCE PAYMENT ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's own ride requests
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

// STEP 3 — Create Razorpay order for FINAL payment
router.post('/create-final-payment', authenticate, async (req, res) => {
  try {
    const { requestId } = req.body;

    const request = await RideRequest.findOne({ _id: requestId, userId: req.user.userId })
      .populate('groupId');
    if (!request) return res.status(404).json({ error: 'Ride request not found' });

    if (request.status !== 'AWAITING_FINAL_PAYMENT') {
      return res.status(400).json({ error: `Cannot pay now. Status: ${request.status}` });
    }

    const group = request.groupId;
    if (!group) return res.status(400).json({ error: 'Group not found' });

    const farePerPassenger = group.farePerPassenger;
    const remaining = Math.max(0, farePerPassenger - request.bookingAmountPaid);

    if (remaining <= 0) {
      // Already fully paid, just confirm
      request.status = 'CONFIRMED';
      await request.save();
      return res.json({ success: true, alreadyPaid: true, message: 'Ride confirmed!' });
    }

    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(remaining * 100),
      currency: 'INR',
      receipt: `taxi_final_${request._id}`,
    });

    res.json({
      success: true,
      requestId: request._id,
      farePerPassenger,
      bookingAmountPaid: request.bookingAmountPaid,
      remainingAmount: remaining,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('CREATE FINAL PAYMENT ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// STEP 4 — Verify FINAL payment and confirm ride
router.post('/verify-final', authenticate, async (req, res) => {
  try {
    const { requestId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const request = await RideRequest.findOne({ _id: requestId, userId: req.user.userId });
    if (!request) return res.status(404).json({ error: 'Ride request not found' });

    request.status = 'CONFIRMED';
    await request.save();

    // Update passenger status in the group
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

    res.json({ success: true, message: 'Ride confirmed!' });
  } catch (err) {
    console.error('VERIFY FINAL PAYMENT ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ===================================================== */
/* ================ TAXI OWNER ROUTES ================== */
/* ===================================================== */

router.get('/groups', async (req, res) => {
  try {
    const groups = await RideGroup.find().sort({ rideDate: 1, rideTime: 1 });
    res.json({ success: true, groups });
  } catch (err) {
    console.error('GET RIDE GROUPS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

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

router.get('/settings', adminJwtAuthenticate, async (req, res) => {
  try {
    let settings = await TaxiSetting.findOne();
    if (!settings) settings = await TaxiSetting.create({});
    res.json({ success: true, settings });
  } catch (err) {
    console.error('GET TAXI SETTINGS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

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
