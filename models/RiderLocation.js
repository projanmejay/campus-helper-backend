const mongoose = require('mongoose');

const riderLocationSchema = new mongoose.Schema({
  riderPhone: { 
    type: String, 
    required: true,
    unique: true // One document per rider
  },
  lat: { 
    type: Number, 
    required: true 
  },
  lng: { 
    type: Number, 
    required: true 
  },
  speed: {
    type: Number,
    default: 0
  },
  heading: { 
    type: Number, 
    default: 0 // Orientation in degrees (0-360)
  },
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('RiderLocation', riderLocationSchema);
