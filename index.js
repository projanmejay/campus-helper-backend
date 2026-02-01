// index.js
const nodemailer = require('nodemailer');
const otpGenerator = require('otp-generator');
const Otp = require('./models/otp');


const Razorpay = require('razorpay');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const Order = require('./models/Order');

const app = express();

/* ------------------ MIDDLEWARE ------------------ */
app.use(cors());

// CAPTURE RAW BODY: Essential for Webhook Signature Verification
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.originalUrl.includes('/razorpay/webhook')) {
      req.rawBody = buf;
    }
  }
}));

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
/* ------------------ SEND EMAIL OTP ------------------ */
app.post('/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Generate 6-digit numeric OTP
    const otp = otpGenerator.generate(6, {
      digits: true,
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });

    // Remove old OTPs for this email
    await Otp.deleteMany({ email });

    // Save OTP with expiry (5 minutes)
    await Otp.create({
      email,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    // Email transport
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Send email
    await transporter.sendMail({
      from: `"Campus Helper" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your Campus Helper OTP',
      text: `Your OTP is ${otp}. It is valid for 5 minutes.`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

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
      amount: order.totalAmount * 100, // Amount in paise
      currency: 'INR',
      receipt: order.orderId, // Limited to 40 chars
      notes: {
        appOrderId: order.orderId // BACKUP: used in webhook if receipt is missing
      },
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

    if (!req.rawBody) {
      console.error('❌ Raw body missing - check middleware order');
      return res.status(400).send('Raw body not captured');
    }

    // 1. Verify Signature using the Raw Buffer
    const expected = crypto
      .createHmac('sha256', secret)
      .update(req.rawBody)
      .digest('hex');

    if (signature !== expected) {
      console.log('❌ Invalid webhook signature');
      return res.status(400).send('Invalid signature');
    }

    // 2. Parse the body now that it's verified
    const event = JSON.parse(req.rawBody.toString());
    console.log('📦 Webhook Event received:', event.event);

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      
      // 3. Resolve Order ID from receipt OR notes
      const appOrderId = payment.receipt || (payment.notes && payment.notes.appOrderId);

      if (!appOrderId) {
        console.error('❌ Order ID (receipt) is undefined in payload');
        return res.status(200).json({ ok: false, error: 'No order ID found' }); 
      }

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
        console.log('✅ Order PAID and Updated:', order.orderId);
      } else {
        console.log('❓ Order ID found but not in DB:', appOrderId);
      }
    }

    // Always send 200 to Razorpay
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ Webhook error:', e);
    res.status(500).send('Webhook error');
  }
});

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
/* ------ping*/
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

/* ------------------ START ------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on ${PORT}`)
);
