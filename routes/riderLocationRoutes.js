const express = require('express');
const router = express.Router();
const RiderLocation = require('../models/RiderLocation');

// POST /location (from Rider App)
router.post('/location', async (req, res) => {
  try {
    const { riderPhone, lat, lng, speed, heading } = req.body;

    if (!riderPhone || lat == null || lng == null) {
      return res.status(400).json({ error: 'Missing required fields: riderPhone, lat, lng' });
    }

    // Upsert the location: Update if exists, create if not
    const updatedLocation = await RiderLocation.findOneAndUpdate(
      { riderPhone },
      { 
        riderPhone, 
        lat: parseFloat(lat), 
        lng: parseFloat(lng), 
        speed: speed ? parseFloat(speed) : 0,
        heading: heading ? parseFloat(heading) : 0,
        lastUpdated: new Date() 
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, data: updatedLocation });
  } catch (error) {
    console.error('Error updating rider location:', error);
    res.status(500).json({ error: 'Failed to update rider location' });
  }
});

// GET /live/:riderPhone (from Student App)
router.get('/live/:riderPhone', async (req, res) => {
  try {
    const { riderPhone } = req.params;
    
    // Optionally filter out stale markers (e.g. older than 5 minutes)
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); 
    
    const location = await RiderLocation.findOne({ 
      riderPhone, 
      lastUpdated: { $gte: cutoffTime } 
    });
    
    if (!location) {
      return res.status(404).json({ error: 'Rider not currently broadcasting or offline' });
    }
    
    res.json(location);
  } catch (error) {
    console.error('Error fetching rider location:', error);
    res.status(500).json({ error: 'Failed to fetch rider location' });
  }
});

// DELETE /location/:riderPhone (when Rider stops broadcasting)
router.delete('/location/:riderPhone', async (req, res) => {
  try {
    const { riderPhone } = req.params;
    await RiderLocation.deleteOne({ riderPhone });
    res.json({ success: true, message: 'Broadcast stopped and location removed' });
  } catch (error) {
    console.error('Error stopping broadcast:', error);
    res.status(500).json({ error: 'Failed to stop broadcast' });
  }
});

module.exports = router;
