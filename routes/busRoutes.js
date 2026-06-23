const express = require('express');
const router = express.Router();

// In-memory store for live bus locations
// Key: routeId, Value: { lat, lng, speed, heading, updatedAt }
const activeBuses = new Map();

// POST /location - Update a bus's location
router.post('/location', (req, res) => {
  try {
    const { routeId, lat, lng, speed, heading } = req.body;

    if (!routeId || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    activeBuses.set(routeId, {
      routeId,
      lat,
      lng,
      speed,
      heading,
      updatedAt: Date.now()
    });

    res.json({ success: true });
  } catch (err) {
    console.error('UPDATE BUS LOCATION ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /location/:routeId - Remove a bus from tracking (e.g., driver goes offline)
router.delete('/location/:routeId', (req, res) => {
  try {
    const { routeId } = req.params;
    activeBuses.delete(routeId);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE BUS LOCATION ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /live - Fetch all active bus locations
router.get('/live', (req, res) => {
  try {
    const now = Date.now();
    const buses = [];

    // Filter out buses that haven't sent an update in the last 2 minutes (120000 ms)
    for (const [routeId, data] of activeBuses.entries()) {
      if (now - data.updatedAt > 120000) {
        activeBuses.delete(routeId); // Clean up stale data
      } else {
        buses.push(data);
      }
    }

    res.json(buses);
  } catch (err) {
    console.error('GET LIVE BUSES ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
