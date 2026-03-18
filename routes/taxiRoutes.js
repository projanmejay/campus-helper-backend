const express = require('express');
const router = express.Router();
const Ride = require('../models/Taxi'); // Import the blueprint

// POST a new ride
router.post('/rides', async (req, res) => {
  const newRide = new Ride(req.body);
  await newRide.save();
  res.json(newRide);
});

module.exports = router;
