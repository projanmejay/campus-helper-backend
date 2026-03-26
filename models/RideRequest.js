const mongoose = require("mongoose");

const rideRequestSchema = new mongoose.Schema(
  {
    // ── User ───────────────────────────────────────────────
    userId:    { type: String, required: true },
    userName:  { type: String, required: true },
    userPhone: { type: String, default: "" },
    userEmail: { type: String, default: "" },
    userRoll:  { type: String, default: "" },
    fcmToken:  { type: String, default: "" },

    // ── Trip ───────────────────────────────────────────────
    from:     { type: String, required: true },
    to:       { type: String, required: true },
    dateTime: { type: Date,   required: true },

    // ── Status ─────────────────────────────────────────────
    // pending       → waiting for match
    // matched       → grouped with others, waiting for cab assignment
    // solo_decision → alone, user must decide within 24hrs
    // driver_assigned → cab assigned, ride confirmed
    // cancelled     → opted out or auto-cancelled
    status: {
      type:    String,
      enum:    ["pending", "matched", "solo_decision", "driver_assigned", "cancelled"],
      default: "pending",
    },

    // ── Group ──────────────────────────────────────────────
    groupId:    { type: String, default: null }, // shared among matched requests
    groupSize:  { type: Number, default: null }, // filled at assignment time
    matchedWith: [{ type: String }],             // _id strings of matched requests

    // ── Payment ────────────────────────────────────────────
    amountPaid:       { type: Number, default: 0 },   // upfront paid (half fare + commission)
    commission:       { type: Number, default: 0 },   // platform fee (non-refundable)
    razorpayOrderId:  { type: String, default: null }, // initial order
    razorpayPaymentId:{ type: String, default: null },
    razorpaySignature:{ type: String, default: null },
    paymentVerified:  { type: Boolean, default: false },

    // ── Solo flow ──────────────────────────────────────────
    soloDecisionDeadline: { type: Date, default: null }, // 24hrs after solo_decision set
    soloExtraOrderId:     { type: String, default: null }, // Razorpay order for extra payment

    // ── Refund ─────────────────────────────────────────────
    refundAmount:     { type: Number, default: 0 },
    refundId:         { type: String, default: null },  // Razorpay refund ID
    refundProcessed:  { type: Boolean, default: false },

    // ── Driver (filled at assignment) ──────────────────────
    driverName:   { type: String, default: "" },
    driverNumber: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RideRequest", rideRequestSchema);
