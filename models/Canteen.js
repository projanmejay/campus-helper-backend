const mongoose = require("mongoose");

const canteenSchema = new mongoose.Schema({
  canteenId: { type: String, required: true, unique: true }, // unique string ID for routing/matching
  name: { type: String, required: true },
  status: { type: String, enum: ["Open", "Closed"], default: "Open" },
  packagingFee: { type: Number, default: 0 },
  phone: { type: String, default: "" },
  ratingSum: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
}, { timestamps: true });

// Virtual for average rating
canteenSchema.virtual("rating").get(function() {
  if (this.ratingCount === 0) return 0;
  return parseFloat((this.ratingSum / this.ratingCount).toFixed(1));
});

canteenSchema.set("toJSON", { virtuals: true });
canteenSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Canteen", canteenSchema);
