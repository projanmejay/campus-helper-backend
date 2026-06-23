const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Models
const RideRequest = require('../models/RideRequest');
const RideGroup = require('../models/RideGroup');
const TaxiSetting = require('../models/TaxiSetting');

// Middleware
const { authenticate } = require('../middleware/auth');
const { adminAuthenticate } = require('../middleware/admin_auth');

/* ===================================================== */
/* ================= STUDENT APP ROUTES ================ */
/* ===================================================== */

// Create a new ride request
router.post('/request', authenticate, async (req, res) => {
  try {
    const { pickup, destination, rideDate, rideTime, passengerCount, contactNumber } = req.body;
    
    // Fetch current settings to get booking advance amount
    let settings = await TaxiSetting.findOne();
    if (!settings) {
      settings = await TaxiSetting.create({}); // Create default if none exists
    }

    const request = await RideRequest.create({
      userId: req.user.userId, // From authenticate middleware
      pickup,
      destination,
      rideDate,
      rideTime,
      passengerCount,
      contactNumber,
      bookingAmountPaid: settings.bookingAdvance * passengerCount, // Assuming advance is per passenger
      status: 'PENDING_GROUPING'
    });

    res.status(201).json({ success: true, requestId: request._id, bookingAmountPaid: request.bookingAmountPaid });
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

// Pay final amount
router.post('/pay-final', authenticate, async (req, res) => {
  try {
    const { requestId } = req.body;
    
    const request = await RideRequest.findOne({ _id: requestId, userId: req.user.userId });
    if (!request) return res.status(404).json({ error: 'Ride request not found' });
    
    if (request.status !== 'AWAITING_FINAL_PAYMENT') {
      return res.status(400).json({ error: 'Ride is not awaiting final payment' });
    }

    // Mark as confirmed
    request.status = 'CONFIRMED';
    await request.save();

    // Also update passenger status in the RideGroup
    if (request.groupId) {
      const group = await RideGroup.findById(request.groupId);
      if (group) {
        const passengerIndex = group.passengers.findIndex(p => p.requestId.toString() === request._id.toString());
        if (passengerIndex > -1) {
          group.passengers[passengerIndex].status = 'CONFIRMED';
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

// Get finalized groups for taxi owner
// In a real app we might authenticate the taxi owner, but based on the previous code, 
// they might not have a specific robust auth or we just return all finalized groups for them to claim/view.
// We'll return groups that are AWAITING_FINAL_PAYMENT (or CONFIRMED logic depending on when we show it to driver).
// Let's assume we show them UPCOMING, IN_PROGRESS, COMPLETED groups.
router.get('/groups', async (req, res) => {
  try {
    const groups = await RideGroup.find()
      .populate('passengers.requestId') // To get original details if needed
      .sort({ rideDate: 1, rideTime: 1 });
    res.json({ success: true, groups });
  } catch (err) {
    console.error('GET RIDE GROUPS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update group status
router.patch('/groups/:groupId/status', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { status } = req.body;

    const validStatuses = ['UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
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

// Get settings
router.get('/settings', adminAuthenticate, async (req, res) => {
  try {
    let settings = await TaxiSetting.findOne();
    if (!settings) {
      settings = await TaxiSetting.create({}); // Create default if none exists
    }
    res.json({ success: true, settings });
  } catch (err) {
    console.error('GET TAXI SETTINGS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update settings
router.put('/settings', adminAuthenticate, async (req, res) => {
  try {
    const updateData = req.body;
    let settings = await TaxiSetting.findOne();
    
    if (!settings) {
      settings = await TaxiSetting.create(updateData);
    } else {
      settings = await TaxiSetting.findOneAndUpdate({}, updateData, { new: true });
    }

    res.json({ success: true, settings });
  } catch (err) {
    console.error('UPDATE TAXI SETTINGS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
