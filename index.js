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

/* ------------------ REGISTER (SEND OTP) ------------------ */

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

/* ------------------ VERIFY OTP ------------------ */

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

/* ------------------ LOGIN ------------------ */

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
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ========================================================= */
/* ===================== ORDER SYSTEM ====================== */
/* ========================================================= */

app.post("/order", async (req, res) => {
  try {
    const { canteen, items, totalAmount } = req.body;

    if (!canteen || totalAmount == null) {
      return res.status(400).json({ error: "canteen & totalAmount required" });
    }

    const orderId = uuidv4();

    const order = await Order.create({
      orderId,
      code: generateCode(),
      canteen,
      items: items || {},
      totalAmount,
      status: "PENDING_PAYMENT",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    res.status(201).json(order);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------ ORDER STATUS ------------------ */

app.get("/order/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({
      status: order.status,
      paidAt: order.paidAt || null,
    });
  } catch (e) {
    console.error("ORDER STATUS ERROR:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------ CREATE RAZORPAY ORDER ------------------ */

app.post("/razorpay/create-order", async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findOne({ orderId });

    if (!order) return res.status(404).json({ error: "Order not found" });

    const rpOrder = await razorpay.orders.create({
      amount: order.totalAmount * 100,
      currency: "INR",
      receipt: order.orderId.substring(0, 40),
      notes: { appOrderId: order.orderId },
      payment_capture: 1,
    });

    order.paymentInfo = {
      provider: "RAZORPAY",
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
    res.status(500).json({ error: "Razorpay error" });
  }
});

/* ------------------ RAZORPAY WEBHOOK ------------------ */

app.post("/razorpay/webhook", async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    if (!req.rawBody) {
      return res.status(400).send("Raw body missing");
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(req.rawBody)
      .digest("hex");

    if (signature !== expected) {
      return res.status(400).send("Invalid signature");
    }

    const event = JSON.parse(req.rawBody.toString());

    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;

      const appOrderId = payment.receipt || payment.notes?.appOrderId;

      if (appOrderId) {
        await Order.findOneAndUpdate(
          { orderId: appOrderId },
          {
            status: "PAID",
            paidAt: new Date(),
            "paymentInfo.razorpayPaymentId": payment.id,
            "paymentInfo.razorpayOrderId": payment.order_id,
          }
        );
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Webhook error:", e);
    res.status(500).send("Webhook error");
  }
});

/* ------------------ HEALTH ------------------ */

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

/* ------------------ START ------------------ */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});