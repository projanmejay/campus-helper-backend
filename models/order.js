const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true },
    code: { type: String },
    canteen: { type: String },
    items: { type: Object },
    totalAmount: { type: Number },
    status: { type: String },
    expiresAt: { type: Date },
    paidAt: { type: Date },
    paymentInfo: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
