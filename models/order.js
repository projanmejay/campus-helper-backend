const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
<<<<<<< HEAD
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
=======
    orderId: { type: String, required: true, unique: true },   // internal UUID
    razorpayOrderId: { type: String, default: null },          // from Razorpay

    canteen: { type: String, required: true },
    items: { type: mongoose.Schema.Types.Mixed, required: true }, // { "Idli": 2, ... }
    totalAmount: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },

    orderType: { type: String, default: "Takeaway" },          // Takeaway | Dine-in | Delivery
    deliveryLocation: { type: String, default: null },
    deliveryDetails: { type: String, default: null },

    status: {
      type: String,
      enum: ["PENDING_PAYMENT", "PAID", "FAILED"],
      default: "PENDING_PAYMENT",
    },

    paymentId: { type: String, default: null },
    signature: { type: String, default: null },
    paidAt: { type: Date, default: null },
>>>>>>> 1a115fb42dab39eba3cbc8a0ca1323deb26bf44e
  },
  { timestamps: true }
);

<<<<<<< HEAD
module.exports = mongoose.model('Order', orderSchema);
=======
module.exports = mongoose.model("Order", orderSchema);
>>>>>>> 1a115fb42dab39eba3cbc8a0ca1323deb26bf44e
