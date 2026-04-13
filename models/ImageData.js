const mongoose = require('mongoose');

const imageDataSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  base64: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60*60*24*30 } // Auto-delete after 30 days
});

module.exports = mongoose.model('ImageData', imageDataSchema);
