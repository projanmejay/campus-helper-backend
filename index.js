require("dotenv").config();

const express    = require("express");
const cors       = require("cors");
const mongoose   = require("mongoose");
const bcrypt     = require("bcrypt");
const crypto     = require("crypto");
const { v4: uuidv4 } = require("uuid");

const Razorpay      = require("razorpay");
const otpGenerator  = require("otp-generator");
const { Resend }    = require("resend");

const discussionRoutes = require("./routes/discussionRoutes");
const rideRequestRoutes = require("./routes/rideRequestRoutes");
const User  = require("./models/User");
const Otp   = require("./models/otp");
const Order = require("./models/order");

const app = express();

/* ------------------ MIDDLEWARE ------------------ */

app.use(cors());

// Keep raw body available for Razorpay webhook signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      if (req.originalUrl.includes("/razorpay/webhook")) {
        req.rawBody = buf;
      }
    },
  })
);

/* ------------------ ENV CHECKS ------------------ */

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI missing");
  process.exit(1);
}
if (!process.env.RESEND_API_KEY)        console.error("❌ RESEND_API_KEY missing — emails will not be sent");
if (!process.env.EMAIL_FROM)            console.error("❌ EMAIL_FROM missing — emails will not be sent");
if (!process.env.RAZORPAY_KEY_ID)       console.error("❌ RAZORPAY_KEY_ID missing");
if (!process.env.RAZORPAY_KEY_SECRET)   console.error("❌ RAZORPAY_KEY_SECRET missing");

/* ------------------ DB ------------------ */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ DB Error:", err);
    process.exit(1);
  });

/* ------------------ ROUTES ------------------ */

app.use("/discussion", discussionRoutes);
app.use("/ride-requests", rideRequestRoutes);
/* ------------------ SERVICES ------------------ */

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const resend = new Resend(process.env.RESEND_API_KEY);

/* ===================================================== */
/* ================= USERNAME ========================== */
/* ===================================================== */

app.get("/user/check-username", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) return res.status(400).json({ error: "email is required" });

    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.username) {
      return res.json({ hasUsername: true, username: user.username });
    }

    res.json({ hasUsername: false });

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

    if (await User.findOne({ username })) {
      return res.status(400).json({ error: "Username already taken" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.usernameConfirmed) {
      return res.status(400).json({ error: "Username already confirmed and cannot be changed" });
    }

    user.username          = username.trim();
    user.usernameConfirmed = true;
    await user.save();

    res.json({ success: true, username: user.username });

  } catch (err) {
    console.error("CREATE USERNAME ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ===================================================== */
/* ================= AUTH ============================== */
/* ===================================================== */

app.post("/auth/register", async (req, res) => {
  try {
    const { name, hall, email, password } = req.body;

    console.log("📩 Register attempt:", email);

    if (!name || !hall || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (await User.findOne({ email })) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const otp = otpGenerator.generate(6, {
      digits:             true,
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars:       false,
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

    console.log("📨 Sending OTP to:", email, "| FROM:", process.env.EMAIL_FROM);

    const { data, error } = await resend.emails.send({
      from:    process.env.EMAIL_FROM,
      to:      email,
      subject: "Campus Helper — OTP Verification",
      html: `
        <h3>Campus Helper Registration</h3>
        <p>Your OTP is:</p>
        <h2 style="letter-spacing:4px">${otp}</h2>
        <p>Valid for 5 minutes. Do not share this with anyone.</p>
      `,
    });

    if (error) {
      console.error("❌ RESEND ERROR:", JSON.stringify(error));
      return res.status(500).json({ error: "Failed to send OTP email. Please try again." });
    }

    console.log("✅ OTP sent | Resend ID:", data?.id);

    res.json({ success: true, message: "OTP sent to email" });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log("🔐 OTP verify:", email);

    const record = await Otp.findOne({ email });

    if (!record) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (record.expiresAt < new Date()) {
      await Otp.deleteOne({ email });
      return res.status(400).json({ error: "OTP expired. Please register again." });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const user = await User.create({
      name:     record.name,
      hall:     record.hall,
      email:    record.email,
      password: record.password,
      verified: true,
    });

    await Otp.deleteOne({ email });

    console.log("✅ User created:", email);

    res.json({
      success: true,
      message: "Account created successfully",
      user: {
        id:    user._id,
        name:  user.name,
        hall:  user.hall,
        email: user.email,
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

    console.log("🔑 Login attempt:", email);

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Invalid password" });
    }

    console.log("✅ Login success:", email);

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id:       user._id,
        name:     user.name,
        hall:     user.hall,
        email:    user.email,
        username: user.username || null,
      },
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ===================================================== */
/* ================= ORDER ============================= */
/* ===================================================== */

/*
  STEP 1 — Flutter: POST /order
  Body: { canteen, items, totalAmount, orderType?, deliveryLocation?, deliveryDetails? }
  Returns: { orderId }
*/
app.post("/order", async (req, res) => {
  try {
    const { canteen, items, totalAmount, orderType, deliveryLocation, deliveryDetails } = req.body;

    if (!canteen || !items || !totalAmount) {
      return res.status(400).json({ error: "canteen, items, and totalAmount are required" });
    }

    const order = await Order.create({
      orderId:          uuidv4(),
      canteen,
      items,
      totalAmount,
      amount:           totalAmount,
      currency:         "INR",
      orderType:        orderType        || "Takeaway",
      deliveryLocation: deliveryLocation || null,
      deliveryDetails:  deliveryDetails  || null,
      status:           "PENDING_PAYMENT",
    });

    res.status(201).json({ success: true, orderId: order.orderId });

  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  STEP 2 — Flutter: POST /razorpay/create-order
  Body: { orderId }
  Returns: { razorpayOrderId, amount, currency, key }
*/
app.post("/razorpay/create-order", async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ error: "Order not found" });

    const rzpOrder = await razorpay.orders.create({
      amount:   Math.round(order.amount * 100), // convert to paise
      currency: order.currency || "INR",
      receipt:  orderId,
    });

    order.razorpayOrderId = rzpOrder.id;
    await order.save();

    res.json({
      success:         true,
      razorpayOrderId: rzpOrder.id,
      amount:          rzpOrder.amount,
      currency:        rzpOrder.currency,
      key:             process.env.RAZORPAY_KEY_ID,
    });

  } catch (err) {
    console.error("RAZORPAY CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Failed to create Razorpay order" });
  }
});

/*
  STEP 3 — Flutter: POST /razorpay/verify-payment
  Body: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
*/
app.post("/razorpay/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment fields" });
    }

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        status:    "PAID",
        paidAt:    new Date(),
      },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json({ success: true, message: "Payment verified", orderId: order.orderId });

  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  STEP 4 — Flutter: GET /order/:orderId/status
  Returns: { status } — "PENDING_PAYMENT" | "PAID" | "FAILED"
*/
app.get("/order/:orderId/status", async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json({ success: true, status: order.status, orderId: order.orderId });

  } catch (err) {
    console.error("GET ORDER STATUS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ORDER HISTORY — GET /orders */
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

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.rawBody)
      .digest("hex");

    if (expected !== signature) {
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

/* ===================================================== */
/* ================= TAXI ============================== */
/* ===================================================== */

app.get("/rides", async (req, res) => {
  try {
    const rides = await mongoose.connection.db
      .collection("rides")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    res.json(rides);
  } catch (err) {
    console.error("GET RIDES ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/rides", async (req, res) => {
  try {
    const { from, to, creator, seatsLeft, driverName, driverNumber, dateTime } = req.body;

    if (!from || !to) {
      return res.status(400).json({ error: "from and to are required" });
    }

    const ride = await mongoose.connection.db.collection("rides").insertOne({
      from,
      to,
      creator:      creator      || "Anonymous",
      seatsLeft:    seatsLeft    || 2,
      driverName:   driverName   || "",
      driverNumber: driverNumber || "",
      dateTime:     dateTime     || "Today",
      createdAt:    new Date(),
    });

    res.status(201).json({ success: true, rideId: ride.insertedId });

  } catch (err) {
    console.error("POST RIDE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/drivers", async (req, res) => {
  try {
    const drivers = await mongoose.connection.db
      .collection("drivers")
      .find({})
      .toArray();
    res.json(drivers);
  } catch (err) {
    console.error("GET DRIVERS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------ HEALTH ------------------ */

app.get("/health", (req, res) => res.send("OK"));

/* ------------------ START ------------------ */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 EMAIL_FROM      : ${process.env.EMAIL_FROM      || "NOT SET ❌"}`);
  console.log(`🔑 RESEND_API_KEY  : ${process.env.RESEND_API_KEY  ? "set ✅" : "NOT SET ❌"}`);
  console.log(`💳 RAZORPAY_KEY_ID : ${process.env.RAZORPAY_KEY_ID ? "set ✅" : "NOT SET ❌"}`);
});
