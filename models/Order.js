const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  canteen: { type: String, required: true },

  items: {
    roti: { type: Number, default: 0 },
    paneer_butter_masala: { type: Number, default: 0 },
  },

  totalAmount: { type: Number, required: true },
  status: { type: String, default: 'PENDING_PAYMENT' },

  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

module.exports = mongoose.model('Order', orderSchema);
