const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  id: { type: String, required: true }, // Item ID slug
  canteenId: { type: String, required: true }, // References Canteen.canteenId
  category: { type: String, required: true }, // e.g. "Fried Rice", "Rolls"
  name: { type: String, required: true },
  price: { type: Number, required: true },
  isVeg: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  ratingSum: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
}, { timestamps: true });

menuItemSchema.virtual("rating").get(function() {
  if (this.ratingCount === 0) return 0;
  return parseFloat((this.ratingSum / this.ratingCount).toFixed(1));
});

menuItemSchema.set("toJSON", { virtuals: true });
menuItemSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("MenuItem", menuItemSchema);
