const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderId:          { type: String, required: true, unique: true },
    canteen:          { type: String },
    items:            { type: Object },
    totalAmount:      { type: Number },
    amount:           { type: Number },          // used by razorpay (paise calc)
    currency:         { type: String, default: "INR" },
    orderType:        { type: String, default: "Takeaway" },
    deliveryLocation: { type: String, default: null },
    deliveryDetails:  { type: String, default: null },
    status:           { type: String, default: "PENDING_PAYMENT" },
    razorpayOrderId:  { type: String, default: null },
    paymentId:        { type: String, default: null },
    signature:        { type: String, default: null },
    paidAt:           { type: Date,   default: null },
    expiresAt:        { type: Date,   default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);