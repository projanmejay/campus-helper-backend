const nodemailer = require('nodemailer');
const otpGenerator = require('otp-generator');
const Otp = require('./models/otp');

const Razorpay = require('razorpay');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const Order = require('./models/order');

const app = express();

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

/* ------------------ GLOBAL EMAIL CONFIG ------------------ */
// Moving this outside the route prevents creating a new connection pool every request
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Use Gmail App Password here
  },
  // Higher timeout for Render cold starts
  connectionTimeout: 10000, 
  greetingTimeout: 10000,
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

    const otp = otpGenerator.generate(6, {
      digits: true,
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });

    // 1. Database Operations (Syncing state first)
    await Otp.deleteMany({ email });
    await Otp.create({
      email,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    // 2. Email Delivery with Internal Try/Catch
    // This prevents the whole request from timing out if SMTP fails
    try {
      await transporter.sendMail({
        from: `"Campus Helper" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your Campus Helper OTP',
        text: `Your OTP is ${otp}. It is valid for 5 minutes.`,
        html: `<h3>Welcome to Campus Helper</h3><p>Your OTP is: <b>${otp}</b></p>`,
      });
      
      return res.json({ success: true, message: 'OTP sent to email' });
    } catch (mailErr) {
      console.error('❌ Nodemailer Error:', mailErr);
      // We return 200/500 depending on if you want the user to proceed anyway
      // Since it's OTP, we must return an error to Flutter
      return res.status(503).json({ error: 'Email service unavailable, try again later' });
    }

  } catch (err) {
    console.error('❌ Auth Route Error:', err);
    res.status(500).json({ error: 'Internal server error' });
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
      amount: order.totalAmount * 100, 
      currency: 'INR',
      receipt: order.orderId.substring(0, 40), 
      notes: {
        appOrderId: order.orderId 
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
      console.error('❌ Raw body missing');
      return res.status(400).send('Raw body not captured');
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(req.rawBody)
      .digest('hex');

    if (signature !== expected) {
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(req.rawBody.toString());

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const appOrderId = payment.receipt || (payment.notes && payment.notes.appOrderId);

      if (!appOrderId) return res.status(200).json({ ok: false }); 

      await Order.findOneAndUpdate(
        { orderId: appOrderId },
        {
          status: 'PAID',
          paidAt: new Date(),
          'paymentInfo.razorpayPaymentId': payment.id,
          'paymentInfo.razorpayOrderId': payment.order_id,
        }
      );
    }
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

/* ------------------ HEALTH CHECK ------------------ */
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

/* ------------------ START ------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on port ${PORT}`)
);