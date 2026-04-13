const mongoose = require("mongoose");

const ConfigSchema = new mongoose.Schema({
  platformFee: {
    type: Number,
    default: 0,
  },
  deliveryFee: {
    type: Number,
    default: 0,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Config", ConfigSchema);
