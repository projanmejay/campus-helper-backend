const mongoose = require('mongoose');

const busLocationSchema = new mongoose.Schema({
  routeId: { 
    type: String, 
    required: true,
    unique: true // Ensure only one document per bus route
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
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('BusLocation', busLocationSchema);
