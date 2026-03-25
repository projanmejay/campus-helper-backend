require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const Razorpay = require("razorpay");
const otpGenerator = require("otp-generator");
const { Resend } = require("resend");

const discussionRoutes = require("./routes/discussionRoutes");
const User = require("./models/User");
const Otp = require("./models/otp");
const Order = require("./models/order");

const app = express();

/* ------------------ MIDDLEWARE ------------------ */
app.use(cors());
app.use(express.json());

/* ------------------ DB ------------------ */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ DB Error:", err);
    process.exit(1);
  });

/* ------------------ ROUTES ------------------ */
app.use("/discussion", discussionRoutes);

/* ------------------ SERVICES ------------------ */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const resend = new Resend(process.env.RESEND_API_KEY);

/* ===================================================== */
/* ================= USERNAME =========================== */
/* ===================================================== */

app.get("/user/check-username", async (req, res) => {
  try {
    const { email } = req.query;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ success: false });

    if (user.username) {
      return res.json({ hasUsername: true, username: user.username });
    }

    res.json({ hasUsername: false });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/user/create-username", async (req, res) => {
  try {
    const { email, username } = req.body;

    if (!username || username.length < 3) {
      return res.status(400).json({ error: "Min 3 chars" });
    }

    if (await User.findOne({ username })) {
      return res.status(400).json({ error: "Taken" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.usernameConfirmed) {
      return res.status(400).json({ error: "Locked" });
    }

    user.username = username;
    user.usernameConfirmed = true;
    await user.save();

    res.json({ success: true, username });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ===================================================== */
/* ================= AUTH =============================== */
/* ===================================================== */

app.post("/auth/register", async (req, res) => {
  try {
    const { name, hall, email, password } = req.body;

    if (!name || !hall || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (await User.findOne({ email })) {
      return res.status(400).json({ error: "User exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

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
      password: hashed,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "OTP",
      html: `<h2>${otp}</h2>`,
    });

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const record = await Otp.findOne({ email });
    if (!record || record.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ error: "Expired" });
    }

    const user = await User.create({
      name: record.name,
      hall: record.hall,
      email,
      password: record.password,
      verified: true,
    });

    await Otp.deleteOne({ email });

    res.json({ success: true, user });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Not found" });

    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Wrong password" });
    }

    res.json({ success: true, user });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ===================================================== */
/* ================= ORDER ============================== */
/* ===================================================== */

app.post("/order", async (req, res) => {
  try {
    const { canteen, items, totalAmount } = req.body;

    if (!canteen || !items || !totalAmount) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const order = await Order.create({
      orderId: uuidv4(),
      canteen,
      items,
      amount: totalAmount,
      currency: "INR",
      status: "PENDING_PAYMENT",
    });

    res.json({ orderId: order.orderId });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------- Razorpay ---------------- */

app.post("/razorpay/create-order", async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ error: "Not found" });

    const rzpOrder = await razorpay.orders.create({
      amount: order.amount * 100,
      currency: "INR",
      receipt: orderId,
    });

    order.razorpayOrderId = rzpOrder.id;
    await order.save();

    res.json({
      razorpayOrderId: rzpOrder.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: rzpOrder.amount,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Razorpay error" });
  }
});

app.post("/razorpay/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { status: "PAID", paymentId: razorpay_payment_id },
      { new: true }
    );

    res.json({ success: true, order });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/order/:orderId/status", async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });

    if (!order) return res.status(404).json({ error: "Not found" });

    res.json({ status: order.status });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ===================================================== */
/* ================= TAXI =============================== */
/* ===================================================== */

app.get("/rides", async (req, res) => {
  const rides = await mongoose.connection.db.collection("rides").find().toArray();
  res.json(rides);
});

app.post("/rides", async (req, res) => {
  const ride = await mongoose.connection.db.collection("rides").insertOne({
    ...req.body,
    createdAt: new Date(),
  });

  res.json({ rideId: ride.insertedId });
});

app.get("/drivers", async (req, res) => {
  const drivers = await mongoose.connection.db.collection("drivers").find().toArray();
  res.json(drivers);
});

/* ---------------- HEALTH ---------------- */
app.get("/health", (req, res) => res.send("OK"));

/* ---------------- START ---------------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Running on ${PORT}`));