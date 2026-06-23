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
const eventRoutes = require("./routes/eventRoutes");
const busRoutes = require("./routes/busRoutes");
const menuRoutes = require("./routes/menuRoutes");
const { createToken, authenticate } = require("./middleware/auth");
const User        = require("./models/User");
const Otp         = require("./models/otp");
const Order       = require("./models/order");
const ImageData   = require("./models/ImageData");
const PasswordReset = require("./models/PasswordReset");
const { adminAuthenticate } = require("./middleware/admin_auth");

const app = express();

/* ------------------ MIDDLEWARE ------------------ */

app.use(cors());

// Keep raw body available for Razorpay webhook signature verification
app.use(
  express.json({
    limit: '50mb',
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
if (!process.env.JWT_SECRET)            console.error("❌ JWT_SECRET missing — authentication will not work");

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
app.use("/events", eventRoutes);
app.use("/bus", busRoutes);
app.use("/menu", menuRoutes);
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

app.post("/user/create-username", authenticate, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    if (await User.findOne({ username })) {
      return res.status(400).json({ error: "Username already taken" });
    }

    const user = await User.findById(req.user.userId);
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
      token: createToken(user),
      user: {
        id:       user._id,
        name:     user.name,
        hall:     user.hall,
        email:    user.email,
        username: user.username || null,
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
      token: createToken(user),
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
/* ============== FORGOT / RESET PASSWORD ============== */
/* ===================================================== */

app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await User.findOne({ email });

    // To avoid user enumeration, always respond with success. But only create token if user exists.
    if (!user) {
      return res.json({ success: true, message: 'If the account exists, an OTP will be sent.' });
    }

    // Delete any existing tokens for this email
    await PasswordReset.deleteMany({ email });

    const otp = otpGenerator.generate(6, { digits: true, upperCaseAlphabets: false, lowerCaseAlphabets: false, specialChars: false });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await PasswordReset.create({ email, token: otp, expiresAt });

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Campus Helper — Password reset OTP',
      html: `
        <h3>Password reset request</h3>
        <p>Your OTP to reset your password is:</p>
        <h2 style="letter-spacing:4px">${otp}</h2>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you did not request this, ignore this email.</p>
      `,
    });

    if (error) {
      console.error('RESEND ERROR (forgot-password):', JSON.stringify(error));
      // Still respond success to frontend
      return res.json({ success: true, message: 'If the account exists, an OTP will be sent.' });
    }

    res.json({ success: true, message: 'If the account exists, an OTP will be sent.' });
  } catch (err) {
    console.error('FORGOT PASSWORD ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    if (!email || !otp || !password) return res.status(400).json({ error: 'email, otp, and password required' });

    const record = await PasswordReset.findOne({ email, token: otp });
    if (!record) return res.status(400).json({ error: 'Invalid or expired OTP' });
    if (record.expiresAt < new Date()) {
      await PasswordReset.deleteOne({ _id: record._id });
      return res.status(400).json({ error: 'OTP expired' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    await user.save();

    await PasswordReset.deleteMany({ email });

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('RESET PASSWORD ERROR:', err);
    res.status(500).json({ error: 'Server error' });
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
app.post("/order", authenticate, async (req, res) => {
  try {
    const { canteen, items, totalAmount, orderType, deliveryLocation, deliveryDetails } = req.body;

    if (!canteen || !items || !totalAmount) {
      return res.status(400).json({ error: "canteen, items, and totalAmount are required" });
    }

    const order = await Order.create({
      orderId:          uuidv4(),
      userId:           req.user.userId,
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
app.post("/razorpay/create-order", authenticate, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    const order = await Order.findOne({ orderId, userId: req.user.userId });
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
app.post("/razorpay/verify-payment", authenticate, async (req, res) => {
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

    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id, userId: req.user.userId });
    if (!order) return res.status(404).json({ error: "Order not found" });

    order.paymentId = razorpay_payment_id;
    order.signature = razorpay_signature;
    order.status = "PAID";
    order.paidAt = new Date();
    await order.save();

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
app.get("/order/:orderId/status", authenticate, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId, userId: req.user.userId });

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json({ success: true, status: order.status, orderId: order.orderId });

  } catch (err) {
    console.error("GET ORDER STATUS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ORDER HISTORY — GET /orders (Mixed Auth: Token for Student, Public for Admin) */
app.get("/orders", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let filter = {};

    // If token exists, verify and filter by the student's userId
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = require("jsonwebtoken").verify(token, process.env.JWT_SECRET);
        filter.userId = decoded.userId;
      } catch (err) {
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    // Admin app sends no token, so filter remains {} and returns all orders
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error("GET ORDERS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  PATCH /order/:orderId/status - Update order status (Used by Canteen Owner)
  Body: { status, estimatedPrepTime, cancellationReason }
*/
app.patch("/order/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, estimatedPrepTime, cancellationReason } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (status) order.orderStatus = status; // In AdminOrder, it maps to orderStatus. Wait, the frontend sends { status: newStatus }. We update order.orderStatus.
    // Actually the frontend expects the backend order to have `orderStatus`
    if (estimatedPrepTime !== undefined) {
      order.estimatedPrepTime = estimatedPrepTime;
      order.prepStartedAt = new Date();
    }
    if (cancellationReason) order.cancellationReason = cancellationReason;

    await order.save();
    res.json({ success: true, orderId: order.orderId, orderStatus: order.orderStatus });
  } catch (err) {
    console.error("PATCH ORDER STATUS ERROR:", err);
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

app.get("/rides", authenticate, async (req, res) => {
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

app.post("/rides", authenticate, async (req, res) => {
  try {
    const { from, to, creator, seatsLeft, driverName, driverNumber, dateTime } = req.body;

    if (!from || !to) {
      return res.status(400).json({ error: "from and to are required" });
    }

    const ride = await mongoose.connection.db.collection("rides").insertOne({
      from,
      to,
      creator:      creator      || req.user.name || "Anonymous",
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

app.get("/drivers", authenticate, async (req, res) => {
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

/* ===================================================== */
/* ================= ADMIN AUTH ====================== */
app.post('/admin/login', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const base64 = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64, 'base64').toString('utf8');
    const [adminId, adminPwd] = credentials.split(':');
    const expectedId = process.env.ADMIN_ID;
    const expectedPwd = process.env.ADMIN_PASSWORD;
    if (adminId === expectedId && adminPwd === expectedPwd) {
      const token = require('jsonwebtoken').sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token });
    }
    return res.status(401).json({ error: 'Invalid admin credentials' });
  } catch (err) {
    console.error('ADMIN LOGIN ERROR:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});
/* ================= UPLOAD IMAGE ====================== */
/* ===================================================== */

// POST /upload-image — stores base64 image in MongoDB, returns a serving URL
app.post('/upload-image', adminAuthenticate, async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) return res.status(400).json({ error: 'base64 image required' });

    const id = require('uuid').v4().substring(0, 16);
    await ImageData.create({ id, base64 });

    const host = req.protocol + '://' + req.get('host');
    const url  = `${host}/images/${id}`;
    return res.status(201).json({ url });
  } catch (err) {
    console.error('UPLOAD IMAGE ERROR:', err);
    return res.status(500).json({ error: 'Server error during image upload' });
  }
});

// GET /images/:id — serves the stored image as JPEG
app.get('/images/:id', async (req, res) => {
  try {
    const imgData = await ImageData.findOne({ id: req.params.id });
    if (!imgData) return res.status(404).send('Not found');

    const buffer = Buffer.from(imgData.base64, 'base64');
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  } catch (err) {
    res.status(500).send('Server error');
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
