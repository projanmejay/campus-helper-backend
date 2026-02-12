const otpGenerator = require('otp-generator');
const { Resend } = require('resend');
const axios = require('axios');

const Otp = require('./models/otp');
const Order = require('./models/order');

const Razorpay = require('razorpay');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const app = express();

/* ------------------ CANTEEN NUMBERS ------------------ */
const CANTEEN_NUMBERS = {
  "AZAD Hall": "919556418889",   // 🔥 put real canteen number
  "RP Hall": "919999999999"
};

/* ------------------ MIDDLEWARE ------------------ */
app.use(cors());

app.use(express.json({
  verify: (req, res, buf) => {
    if (req.originalUrl.includes('/razorpay/webhook')) {
      req.rawBody = buf;
    }
  }
}));

/* ------------------ MONGODB ------------------ */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB error', err);
    process.exit(1);
  });

/* ------------------ RAZORPAY ------------------ */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ------------------ RESEND ------------------ */
const resend = new Resend(process.env.RESEND_API_KEY);

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

    if (!canteen || totalAmount == null)
      return res.status(400).json({ error: 'canteen & totalAmount required' });

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
      receipt: order.orderId.substring(0, 40),
      notes: { appOrderId: order.orderId },
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

/* ------------------ RAZORPAY WEBHOOK ------------------ */
app.post('/razorpay/webhook', async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    const expected = crypto
      .createHmac('sha256', secret)
      .update(req.rawBody)
      .digest('hex');

    if (signature !== expected)
      return res.status(400).send('Invalid signature');

    const event = JSON.parse(req.rawBody.toString());

    if (event.event === 'payment.captured') {

      const payment = event.payload.payment.entity;
      const appOrderId = payment.notes?.appOrderId;

      if (appOrderId) {

        const order = await Order.findOneAndUpdate(
          { orderId: appOrderId },
          {
            status: 'PAID',
            paidAt: new Date(),
            'paymentInfo.razorpayPaymentId': payment.id,
          },
          { new: true }
        );

        if (order) {

          const canteenPhone = CANTEEN_NUMBERS[order.canteen];

          if (canteenPhone) {

            // Count paid orders for numbering
            const orderCount = await Order.countDocuments({
              canteen: order.canteen,
              status: "PAID"
            });

            // Format items
            let itemsText = "";
            for (const [item, qty] of Object.entries(order.items)) {
              if (qty > 0) {
                itemsText += `${item} x${qty}\n`;
              }
            }

            const message = `Order #${orderCount}\n\n${itemsText}`;

            try {
              await axios.post(
                "https://unerasable-penelope-nomadically.ngrok-free.dev/send-file",
                {
                  phone: canteenPhone,
                  text: message
                }
              );

              console.log("✅ Order sent to canteen");

            } catch (waErr) {
              console.error("❌ WhatsApp failed:", waErr.message);
            }
          }
        }
      }
    }

    res.json({ ok: true });

  } catch (e) {
    console.error('❌ Webhook error:', e);
    res.status(500).send('Webhook error');
  }
});

/* ------------------ HEALTH ------------------ */
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

/* ------------------ START ------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
