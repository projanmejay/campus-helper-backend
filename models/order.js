const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderId:          { type: String, required: true, unique: true },
    canteen:          { type: String },          // Display Name (for student history)
    canteenId:        { type: String },          // Unique ID (for admin/rider filtering)
    items:            { type: Object },
    totalAmount:      { type: Number },
    packagingFee:     { type: Number, default: 0 },
    platformFee:      { type: Number, default: 0 },
    deliveryFee:      { type: Number, default: 0 },
    amount:           { type: Number },          // used by razorpay (paise calc)
    currency:         { type: String, default: "INR" },
    orderType:        { type: String, default: "Takeaway" },
    deliveryLocation: { type: String, default: null },
    deliveryDetails:  { type: String, default: null },
    pickupCode:       { type: String, default: null },
    deliveryCode:     { type: String, default: null },
    riderPhone:       { type: String, default: null },
    canteenPhone:     { type: String, default: null },

    // ─── Payment status ───
    status:           { type: String, default: "PENDING_PAYMENT" },
    razorpayOrderId:  { type: String, default: null },
    paymentId:        { type: String, default: null },
    signature:        { type: String, default: null },
    paidAt:           { type: Date,   default: null },
    expiresAt:        { type: Date,   default: null },

    // ─── Who ordered ───
    userId:           { type: String, default: null },
    userName:         { type: String, default: null },
    userEmail:        { type: String, default: null },
    userHall:         { type: String, default: null },
    userPhone:        { type: String, default: null },

    // ─── Order preparation / fulfillment status ───
    // PLACED → PREPARING → READY → PICKED_UP (takeaway/dine-in)
    // PLACED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED (delivery)
    orderStatus:      { type: String, default: "PLACED" },
    
    // ⏰ Preparation Timer
    estimatedPrepTime: { type: Number, default: 0 },   // in minutes
    prepStartedAt:     { type: Date,   default: null },
    
    // 📝 User Instructions (replaces deliveryDetails usage)
    instructions:      { type: String, default: null },
    
    // ❌ Cancellation Tracking
    cancellationReason: { type: String, default: null },
    isRefunded:         { type: Boolean, default: false },

    // ⭐ Rating Tracking (Stores item IDs/Names that have been rated from this order)
    ratedItems:        { type: [String], default: [] },
  },

  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
