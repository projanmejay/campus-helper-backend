const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    userId:           { type: String, required: true },
    orderId:          { type: String, required: true, unique: true },
    canteen:          { type: String },
    canteenId:        { type: String, default: null },
    items:            { type: Object },
    totalAmount:      { type: Number },
    amount:           { type: Number, required: true },
    currency:         { type: String, default: "INR" },
    orderType:        { type: String, default: "Takeaway" },
    deliveryLocation: { type: String, default: null },
    deliveryDetails:  { type: String, default: null },
    instructions:     { type: String, default: null },
    status:           { type: String, default: "PENDING_PAYMENT" },  // payment status
    orderStatus:      { type: String, default: "PLACED" },          // kitchen workflow
    razorpayOrderId:  { type: String, default: null },
    paymentId:        { type: String, default: null },
    signature:        { type: String, default: null },
    paidAt:           { type: Date,   default: null },
    expiresAt:        { type: Date,   default: null },
    estimatedPrepTime:{ type: Number, default: 0 },
    prepStartedAt:    { type: Date,   default: null },
    cancellationReason: { type: String, default: null },
    pickupCode:       { type: String, default: null },
    deliveryCode:     { type: String, default: null },
    // User info (denormalized for canteen display)
    userName:         { type: String, default: null },
    userEmail:        { type: String, default: null },
    userHall:         { type: String, default: null },
    userPhone:        { type: String, default: null },
    packagingFee:     { type: Number, default: 0 },
    platformFee:      { type: Number, default: 0 },
    deliveryFee:      { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);

