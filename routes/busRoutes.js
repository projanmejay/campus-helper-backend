const express = require('express');
const router = express.Router();
const BusLocation = require('../models/BusLocation');

// POST /location (from Driver App)
router.post('/location', async (req, res) => {
  try {
    const { routeId, lat, lng, speed } = req.body;

    if (!routeId || lat == null || lng == null) {
      return res.status(400).json({ error: 'Missing required fields: routeId, lat, lng' });
    }

    // Upsert the location: Update if exists, create if not
    const updatedLocation = await BusLocation.findOneAndUpdate(
      { routeId },
      { 
        routeId, 
        lat: parseFloat(lat), 
        lng: parseFloat(lng), 
        speed: speed ? parseFloat(speed) : 0,
        lastUpdated: new Date() 
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, data: updatedLocation });
  } catch (error) {
    console.error('Error updating bus location:', error);
    res.status(500).json({ error: 'Failed to update bus location' });
  }
});

// GET /live (from Student App)
router.get('/live', async (req, res) => {
  try {
    // Optionally filter out buses that haven't updated in the last 15 minutes to avoid stale markers
    const cutoffTime = new Date(Date.now() - 15 * 60 * 1000); 
    
    const liveBuses = await BusLocation.find({ lastUpdated: { $gte: cutoffTime } });
    
    res.json(liveBuses);
  } catch (error) {
    console.error('Error fetching live bus locations:', error);
    res.status(500).json({ error: 'Failed to fetch bus locations' });
  }
});

// DELETE /location/:routeId (when Driver stops broadcasting)
router.delete('/location/:routeId', async (req, res) => {
  try {
    const { routeId } = req.params;
    await BusLocation.deleteOne({ routeId });
    res.json({ success: true, message: 'Broadcast stopped and location removed' });
  } catch (error) {
    console.error('Error stopping broadcast:', error);
    res.status(500).json({ error: 'Failed to stop broadcast' });
  }
});

module.exports = router;
