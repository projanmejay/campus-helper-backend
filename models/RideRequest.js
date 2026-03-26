const mongoose = require("mongoose");

const rideRequestSchema = new mongoose.Schema(
  {
    // ── User info (from AuthProvider) ──────────────────────
    userId:    { type: String, required: true },
    userName:  { type: String, required: true },
    userPhone: { type: String, default: "" },
    userEmail: { type: String, default: "" },
    userRoll:  { type: String, default: "" },
    fcmToken:  { type: String, default: "" }, // for push notifications

    // ── Trip info ──────────────────────────────────────────
    from:       { type: String, required: true },
    to:         { type: String, required: true },
    dateTime:   { type: Date,   required: true },
    passengers: { type: Number, required: true, min: 1, max: 6 },

    // ── Matching ───────────────────────────────────────────
    status: {
      type:    String,
      enum:    ["pending", "matched", "driver_assigned"],
      default: "pending",
    },
    matchedWith: [{ type: String }], // array of other RideRequest _id strings

    // ── Driver info (filled by admin) ──────────────────────
    driverName:   { type: String, default: "" },
    driverNumber: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RideRequest", rideRequestSchema);
