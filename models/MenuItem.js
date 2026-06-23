const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  id: { type: String },
  canteenId: { type: String, required: true },
  category: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  isVeg: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  itemOrder: { type: Number, default: 0 },
  sectionOrder: { type: Number, default: 0 },
  ratingSum: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 }
});

module.exports = mongoose.model("MenuItem", menuItemSchema);
