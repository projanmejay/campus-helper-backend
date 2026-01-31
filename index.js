// index.js
const Razorpay = require('razorpay');
const crypto = require('crypto');

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const Order = require('./models/Order');

const app = express();
app.use(cors());
app.use(express.json());

/* ------------------ MONGODB CONNECTION ------------------ */
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is missing in environment variables');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

/* ------------------ RAZORPAY CONFIG ------------------ */
console.log("KEY =", process.env.RAZORPAY_KEY_ID);
console.log("SECRET =", process.env.RAZORPAY_KEY_SECRET ? "SET" : "MISSING");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ------------------ UTIL ------------------ */
function generateCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/* ------------------ CREATE ORDER ------------------ */
app.post('/order', async (req, res) => {
  try {
    const { canteen, items, totalAmount } = req.body;

    if (!canteen || totalAmount == null) {
      return res.status(400).json({ error: 'canteen and totalAmount required' });
    }

    const orderId = uuidv4();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const order = new Order({
      orderId,
      code,
      canteen,
      items: items || {},
      totalAmount,
      status: 'PENDING_PAYMENT',
      expiresAt,
    });

    await order.save();

    res.status(201).json({ orderId, code, expiresAt });
  } catch (err) {
    console.error('❌ Create order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ------------------ CREATE RAZORPAY ORDER ------------------ */
app.post('/razorpay/create-order', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId required' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'PENDING_PAYMENT') {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: order.totalAmount * 100,
      currency: 'INR',
      receipt: order.orderId,
      payment_capture: 1,
    });

    order.paymentInfo = {
      ...(order.paymentInfo || {}),
      provider: 'RAZORPAY',
      razorpayOrderId: razorpayOrder.id,
    };
    await order.save();

    res.json({
      key: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    });
  } catch (err) {
    console.error('❌ Razorpay order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ------------------ VERIFY RAZORPAY PAYMENT ------------------ */
app.post('/razorpay/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const body = razorpay_order_id + '|' + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { 'paymentInfo.razorpayOrderId': razorpay_order_id },
      {
        $set: {
        status: 'PAID',
        paidAt: new Date(),
        'paymentInfo.razorpayPaymentId': razorpay_payment_id,
        },
      },
      { new : true }
    );

    if(!updatedOrder){
      console.log(
        '❌ Order NOT found for Razorpay Order ID:',
        razorpay_order_id
      );
      return res.status(404).json({ success: false });
    }
    console.log('✅ Order marked PAID:', updatedOrder.orderId);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Verify payment error:', err);
    res.status(500).json({ success: false });
  }
});

/* ------------------ CHECK ORDER STATUS ------------------ */
app.get('/order/:id/status', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status === 'PENDING_PAYMENT' && Date.now() > order.expiresAt) {
      order.status = 'EXPIRED';
      await order.save();
    }

    res.json({
      orderId: order.orderId,
      status: order.status,
      code: order.code,
      totalAmount: order.totalAmount,
      canteen: order.canteen,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ------------------ LIST ORDERS (ADMIN) ------------------ */
app.get('/orders', async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json(orders);
});

/* ------------------ ADMIN CONFIRM (OPTIONAL) ------------------ */
app.post('/admin/confirm-order', async (req, res) => {
  const { orderId } = req.body;
  const order = await Order.findOne({ orderId });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.status = 'PAID';
  order.paidAt = new Date();
  order.paymentInfo = { method: 'MANUAL_CONFIRM' };

  await order.save();
  res.json({ ok: true });
});

/* ------------------ ADMIN PAGE ------------------ */
app.get('/admin', (req, res) => {
  res.send(`<h2>Admin Panel</h2><p>Use /orders API</p>`);
});

/* ------------------ START SERVER ------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
