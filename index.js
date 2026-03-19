const discussionRoutes = require("./routes/discussionRoutes");

const otpGenerator = require("otp-generator");
const { Resend } = require("resend");

const Otp = require("./models/otp");
const Order = require("./models/order");
const User = require("./models/User");

const bcrypt = require("bcrypt");

const Razorpay = require("razorpay");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const app = express();

/* ------------------ MIDDLEWARE ------------------ */

app.use(cors());

app.use(
  express.json({
    verify: (req, res, buf) => {
      if (req.originalUrl.includes("/razorpay/webhook")) {
        req.rawBody = buf;
      }
    },
  })
);

/* ------------------ MONGODB ------------------ */

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI missing");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB error", err);
    process.exit(1);
  });

/* ------------------ DISCUSSION ROUTES ------------------ */

app.use("/discussion", discussionRoutes);

/* ===================================================== */
/* ================= USERNAME SYSTEM =================== */
/* ===================================================== */

app.get("/user/check-username", async (req, res) => {
  try {
    const { email } = req.query;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.username) {
      return res.json({
        hasUsername: true,
        username: user.username,
      });
    }

    return res.json({
      hasUsername: false,
    });

  } catch (err) {
    console.error("CHECK USERNAME ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});


app.post("/user/create-username", async (req, res) => {
  try {

    const { email, username } = req.body;

    if (!username || username.trim().length < 3) {
      return res.status(400).json({
        error: "Username must be at least 3 characters",
      });
    }

    const existingUsername = await User.findOne({ username });

    if (existingUsername) {
      return res.status(400).json({
        error: "Username already taken",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    if (user.usernameConfirmed) {
      return res.status(400).json({
        error: "Username already confirmed and cannot be changed",
      });
    }

    user.username = username;
    user.usernameConfirmed = true;

    await user.save();

    res.json({
      success: true,
      message: "Username created successfully",
      username: user.username,
    });

  } catch (err) {

    console.error("CREATE USERNAME ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }
});

/* ------------------ RAZORPAY ------------------ */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ------------------ RESEND ------------------ */

if (!process.env.RESEND_API_KEY) {
  console.error("❌ RESEND_API_KEY missing");
}

if (!process.env.EMAIL_FROM) {
  console.error("❌ EMAIL_FROM missing");
}

const resend = new Resend(process.env.RESEND_API_KEY);

/* ------------------ UTIL ------------------ */

function generateCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/* ========================================================= */
/* ====================== AUTH SYSTEM ====================== */
/* ========================================================= */

app.post("/auth/register", async (req, res) => {
  try {

    const { name, hall, email, password } = req.body;

    if (!name || !hall || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const otp = otpGenerator.generate(6, {
      digits: true,
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });

    await Otp.deleteMany({ email });

    await Otp.create({
      email,
      name,
      hall,
      password: hashedPassword,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Campus Helper OTP Verification",
      html: `
      <h3>Campus Helper Registration</h3>
      <p>Your OTP is:</p>
      <h2>${otp}</h2>
      <p>Valid for 5 minutes.</p>
      `,
    });

    res.json({ success: true, message: "OTP sent to email" });

  } catch (err) {

    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }
});


app.post("/auth/verify-otp", async (req, res) => {
  try {

    const { email, otp } = req.body;

    const record = await Otp.findOne({ email });

    if (!record) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (record.expiresAt < new Date()) {
      await Otp.deleteOne({ email });
      return res.status(400).json({ error: "OTP expired" });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const newUser = await User.create({
      name: record.name,
      hall: record.hall,
      email: record.email,
      password: record.password,
      verified: true,
    });

    await Otp.deleteOne({ email });

    res.json({
      success: true,
      message: "Account created successfully",
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
      },
    });

  } catch (err) {

    console.error("VERIFY OTP ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }
});


app.post("/auth/login", async (req, res) => {
  try {

    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({ error: "Invalid password" });
    }

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        hall: user.hall,
        email: user.email,
        username: user.username || null,
      },
    });

  } catch (err) {

    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }
});

/* ========================================================= */
/* ===================== PAYMENT SYSTEM ==================== */
/* ========================================================= */

/* --- Create Razorpay Order --- */

app.post("/razorpay/create-order", async (req, res) => {
  try {

    const { amount, currency = "INR", userId, items, deliveryAddress } = req.body;

    if (!amount || !userId) {
      return res.status(400).json({ error: "amount and userId are required" });
    }

    const receiptId = uuidv4();

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency,
      receipt: receiptId,
      notes: { userId },
    });

    // Save pending order to DB
    const order = await Order.create({
      orderId: razorpayOrder.id,
      receipt: receiptId,
      userId,
      items: items || [],
      deliveryAddress: deliveryAddress || "",
      amount,
      currency,
      status: "pending",
    });

    res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
      dbOrderId: order._id,
    });

  } catch (err) {

    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Failed to create order" });

  }
});

/* --- Verify Payment (client-side callback) --- */

app.post("/razorpay/verify-payment", async (req, res) => {
  try {

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment fields" });
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Update order in DB
    const order = await Order.findOneAndUpdate(
      { orderId: razorpay_order_id },
      {
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        status: "paid",
        paidAt: new Date(),
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Send confirmation email
    try {
      const user = await User.findById(order.userId);
      if (user) {
        await resend.emails.send({
          from: process.env.EMAIL_FROM,
          to: user.email,
          subject: "Payment Confirmed – Campus Helper",
          html: `
            <h3>Payment Successful 🎉</h3>
            <p>Hi ${user.name},</p>
            <p>Your payment of ₹${order.amount} has been received.</p>
            <p><strong>Order ID:</strong> ${order.orderId}</p>
            <p><strong>Payment ID:</strong> ${order.paymentId}</p>
            <p>Thank you for using Campus Helper!</p>
          `,
        });
      }
    } catch (emailErr) {
      console.error("EMAIL SEND ERROR:", emailErr);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: "Payment verified",
      order,
    });

  } catch (err) {

    console.error("VERIFY PAYMENT ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }
});

/* --- Razorpay Webhook (server-side event confirmation) --- */

app.post("/razorpay/webhook", async (req, res) => {
  try {

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("❌ RAZORPAY_WEBHOOK_SECRET missing");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    const signature = req.headers["x-razorpay-signature"];

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const event = req.body;

    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;

      await Order.findOneAndUpdate(
        { orderId: payment.order_id },
        {
          paymentId: payment.id,
          status: "paid",
          paidAt: new Date(),
        }
      );
    }

    if (event.event === "payment.failed") {
      const payment = event.payload.payment.entity;

      await Order.findOneAndUpdate(
        { orderId: payment.order_id },
        { status: "failed" }
      );
    }

    res.json({ success: true });

  } catch (err) {

    console.error("WEBHOOK ERROR:", err);
    res.status(500).json({ error: "Webhook processing failed" });

  }
});

/* --- Get Order by ID --- */

app.get("/razorpay/order/:orderId", async (req, res) => {
  try {

    const order = await Order.findOne({ orderId: req.params.orderId });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ success: true, order });

  } catch (err) {

    console.error("GET ORDER ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }
});

/* --- Get All Orders for a User --- */

app.get("/razorpay/orders/user/:userId", async (req, res) => {
  try {

    const orders = await Order.find({ userId: req.params.userId }).sort({
      createdAt: -1,
    });

    res.json({ success: true, orders });

  } catch (err) {

    console.error("GET USER ORDERS ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }
});

/* ------------------ HEALTH ------------------ */

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

/* ------------------ START SERVER ------------------ */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
