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

/* ===================================================== */
/* ================= USERNAME SYSTEM =================== */
/* ===================================================== */

app.get("/user/check-username", async (req, res) => {
  try {
    const { email } = req.query;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.username) {
      return res.json({ hasUsername: true, username: user.username });
    }

    return res.json({ hasUsername: false });
  } catch (err) {
    console.error("CHECK USERNAME ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/user/create-username", async (req, res) => {
  try {
    const { email, username } = req.body;

    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: "Username already taken" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.usernameConfirmed) {
      return res.status(400).json({ error: "Username already confirmed and cannot be changed" });
    }

    user.username = username;
    user.usernameConfirmed = true;
    await user.save();

    res.json({ success: true, message: "Username created successfully", username: user.username });
  } catch (err) {
    console.error("CREATE USERNAME ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

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
      user: { id: newUser._id, name: newUser.name, email: newUser.email },
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

/*
  STEP 1 — Flutter: POST /order
  Called from _createOrder() in payment_option_screen.dart
  Body: { canteen, items, totalAmount, orderType, deliveryLocation?, deliveryDetails? }
  Returns: { orderId }
*/
app.post("/order", async (req, res) => {
  try {
    const { canteen, items, totalAmount, orderType, deliveryLocation, deliveryDetails } = req.body;

    if (!canteen || !items || !totalAmount) {
      return res.status(400).json({ error: "canteen, items, and totalAmount are required" });
    }

    const internalOrderId = uuidv4();

    const order = await Order.create({
      orderId: internalOrderId,
      canteen,
      items,
      totalAmount,
      amount: totalAmount,
      currency: "INR",
      orderType: orderType || "Takeaway",
      deliveryLocation: deliveryLocation || null,
      deliveryDetails: deliveryDetails || null,
      status: "PENDING_PAYMENT",
    });

    res.status(201).json({
      success: true,
      orderId: order.orderId,
    });
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  STEP 2 — Flutter: POST /razorpay/create-order
  Called from _startRazorpayPayment() in payment_option_screen.dart
  Body: { orderId }
  Returns: { razorpayOrderId, amount, currency, key }
*/
app.post("/razorpay/create-order", async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.amount * 100), // paise
      currency: order.currency || "INR",
      receipt: orderId,
    });

    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.json({
      success: true,
      razorpayOrderId: razorpayOrder.id, // Flutter reads data['razorpayOrderId']
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("RAZORPAY CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Failed to create Razorpay order" });
  }
});

/*
  STEP 3 — Flutter: POST /razorpay/verify-payment
  Called from _onPaymentSuccess() in payment_option_screen.dart
  Body: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
*/
app.post("/razorpay/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment fields" });
    }

    // Verify HMAC signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        status: "PAID",
        paidAt: new Date(),
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ success: true, message: "Payment verified", orderId: order.orderId });
  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  STEP 4 — Flutter: GET /order/:orderId/status
  Polled from PendingPaymentScreen every 4 seconds
  Returns: { status } — "PENDING_PAYMENT" | "PAID" | "FAILED"
*/
app.get("/order/:orderId/status", async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ success: true, status: order.status, orderId: order.orderId });
  } catch (err) {
    console.error("GET ORDER STATUS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  ORDER HISTORY — Flutter: GET /orders
  Called from OrderHistoryScreen._fetchOrders()
  Returns array of all orders (newest first)
*/
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error("GET ORDERS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* --- Razorpay Webhook (server-side backup) --- */

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
        { razorpayOrderId: payment.order_id },
        { paymentId: payment.id, status: "PAID", paidAt: new Date() }
      );
    }

    if (event.event === "payment.failed") {
      const payment = event.payload.payment.entity;
      await Order.findOneAndUpdate(
        { razorpayOrderId: payment.order_id },
        { status: "FAILED" }
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

/* ========================================================= */
/* ====================== TAXI SYSTEM ====================== */
/* ========================================================= */

/*
  Flutter: GET /rides
  Called from TaxiScreen._fetchData('rides')
*/
app.get("/rides", async (req, res) => {
  try {
    const rides = await mongoose.connection.db.collection("rides")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    res.json(rides);
  } catch (err) {
    console.error("GET RIDES ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Flutter: POST /rides
  Called from _PostRideForm when posting a new ride
  Body: { from, to, creator, seatsLeft, driverName, driverNumber, dateTime }
*/
app.post("/rides", async (req, res) => {
  try {
    const { from, to, creator, seatsLeft, driverName, driverNumber, dateTime } = req.body;

    if (!from || !to) {
      return res.status(400).json({ error: "from and to are required" });
    }

    const ride = await mongoose.connection.db.collection("rides").insertOne({
      from,
      to,
      creator: creator || "Anonymous",
      seatsLeft: seatsLeft || 2,
      driverName: driverName || "",
      driverNumber: driverNumber || "",
      dateTime: dateTime || "Today",
      createdAt: new Date(),
    });

    res.status(201).json({ success: true, rideId: ride.insertedId });
  } catch (err) {
    console.error("POST RIDE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Flutter: GET /drivers
  Called from TaxiScreen._fetchData('drivers')
*/
app.get("/drivers", async (req, res) => {
  try {
    const drivers = await mongoose.connection.db.collection("drivers")
      .find({})
      .toArray();
    res.json(drivers);
  } catch (err) {
    console.error("GET DRIVERS ERROR:", err);
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
