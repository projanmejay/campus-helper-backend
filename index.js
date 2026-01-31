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
app.use(express.json()); // NORMAL routes only

/* ------------------ MONGODB ------------------ */
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI missing');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB error', err);
    process.exit(1);
  });

/* ------------------ RAZORPAY ------------------ */
console.log('KEY =', process.env.RAZORPAY_KEY_ID);
console.log('SECRET =', process.env.RAZORPAY_KEY_SECRET ? 'SET' : 'MISSING');

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
      return res.status(400).json({ error: 'canteen & totalAmount required' });
    }

    const orderId = uuidv4();

    const order = await Order.create({
      orderId,
      code: generateCode(),
      canteen,
      items: items || {},
      totalAmount,
      status: 'PENDING_PAYMENT',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    res.status(201).json(order);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ------------------ CREATE RAZORPAY ORDER ------------------ */
app.post('/razorpay/create-order', async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const rpOrder = await razorpay.orders.create({
      amount: order.totalAmount * 100,
      currency: 'INR',
      receipt: order.orderId, // 🔑 VERY IMPORTANT
      payment_capture: 1,
    });

    order.paymentInfo = {
      provider: 'RAZORPAY',
      razorpayOrderId: rpOrder.id,
    };
    await order.save();

    res.json({
      key: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Razorpay error' });
  }
});

/* ------------------ RAZORPAY WEBHOOK (ONLY ONE) ------------------ */
app.post(
  '/razorpay/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature = req.headers['x-razorpay-signature'];

      const expected = crypto
        .createHmac('sha256', secret)
        .update(req.body)
        .digest('hex');

      if (signature !== expected) {
        console.log('❌ Invalid webhook signature');
        return res.status(400).send('Invalid signature');
      }

      const event = JSON.parse(req.body.toString());

      if (event.event === 'payment.captured') {
        const payment = event.payload.payment.entity;
        const appOrderId = payment.receipt; // 🔑 YOUR UUID

        const order = await Order.findOneAndUpdate(
          { orderId: appOrderId },
          {
            status: 'PAID',
            paidAt: new Date(),
            'paymentInfo.razorpayPaymentId': payment.id,
            'paymentInfo.razorpayOrderId': payment.order_id,
          },
          { new: true }
        );

        if (order) {
          console.log('✅ Order PAID:', order.orderId);
        } else {
          console.log('❌ Order not found for receipt:', appOrderId);
        }
      }

      res.json({ ok: true });
    } catch (e) {
      console.error('❌ Webhook error:', e);
      res.status(500).send('Webhook error');
    }
  }
);

/* ------------------ ORDER STATUS ------------------ */
app.get('/order/:id/status', async (req, res) => {
  const order = await Order.findOne({ orderId: req.params.id });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

/* ------------------ ADMIN ------------------ */
app.get('/orders', async (req, res) => {
  res.json(await Order.find().sort({ createdAt: -1 }));
});

/* ------------------ START ------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on ${PORT}`)
);
