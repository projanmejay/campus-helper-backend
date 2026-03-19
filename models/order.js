const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
