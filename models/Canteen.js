const mongoose = require("mongoose");

const canteenSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // e.g., 'azad_hall'
  name: { type: String, required: true }, // e.g., 'AZAD Canteen'
  status: { type: String, default: 'Open' }, // 'Open' or 'Closed'
  packagingFee: { type: Number, default: 0 },
  phone: { type: String, default: '' },
});

module.exports = mongoose.model("Canteen", canteenSchema);
