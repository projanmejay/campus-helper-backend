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
const rideRequestRoutes = require("./routes/rideRequestRoutes");
const busRoutes = require("./routes/busRoutes");
const riderLocationRoutes = require("./routes/riderLocationRoutes");
const menuRoutes = require("./routes/menuRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const poolingRoutes = require("./routes/poolingRoutes");
const User = require("./models/User");
const Otp = require("./models/otp");
const Order = require("./models/order");
const MenuItem = require("./models/MenuItem");
const Canteen = require("./models/Canteen");
const Config = require("./models/Config");
const Event = require("./models/Event");
const ImageData = require("./models/ImageData");

const generateVerificationCode = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const app = express();

/* ------------------ MIDDLEWARE ------------------ */

app.use(cors());

// Keep raw body available for Razorpay webhook signature verification
app.use(
  express.json({
    limit: '20mb',
    verify: (req, res, buf) => {
      if (req.originalUrl && req.originalUrl.includes("/razorpay/webhook")) {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ limit: '20mb', extended: true })); // Correctly handle form-data from transmitter app


/* ------------------ ENV CHECKS ------------------ */

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI missing");
  process.exit(1);
}
if (!process.env.RESEND_API_KEY) console.error("❌ RESEND_API_KEY missing — emails will not be sent");
if (!process.env.EMAIL_FROM) console.error("❌ EMAIL_FROM missing — emails will not be sent");
if (!process.env.RAZORPAY_KEY_ID) console.error("❌ RAZORPAY_KEY_ID missing");
if (!process.env.RAZORPAY_KEY_SECRET) console.error("❌ RAZORPAY_KEY_SECRET missing");

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
app.use("/bus", busRoutes);
app.use("/rider", riderLocationRoutes);
app.use("/menu", menuRoutes);
app.use("/notifications", notificationRoutes);
app.use("/chat", chatRoutes);
app.use("/pooling", poolingRoutes);
/* ------------------ SERVICES ------------------ */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
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

app.get("/user/exists", async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username is required" });

    const user = await User.findOne({ username });
    if (user) {
      return res.json({ exists: true });
    }
    return res.json({ exists: false });
  } catch (err) {
    console.error("USER EXISTS ERROR:", err);
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

    user.username = username.trim();
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

    console.log("📨 Sending OTP to:", email, "| FROM:", process.env.EMAIL_FROM);

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
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
      name: record.name,
      hall: record.hall,
      email: record.email,
      password: record.password,
      verified: true,
    });

    await Otp.deleteOne({ email });

    console.log("✅ User created:", email);

    res.json({
      success: true,
      message: "Account created successfully",
      user: {
        id: user._id,
        name: user.name,
        hall: user.hall,
        email: user.email,
        hall: user.hall,
        phone: user.phone || '',
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
        id: user._id,
        name: user.name,
        email: user.email,
        hall: user.hall,
        phone: user.phone || '',
        username: user.username || null,
      },
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/auth/update", async (req, res) => {
  try {
    const { userId, name, hall, phone } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (name) user.name = name;
    if (hall) user.hall = hall;
    if (phone) user.phone = phone;

    await user.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        hall: user.hall,
        email: user.email,
        phone: user.phone || '',
      }
    });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
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
    const {
      canteen, canteenId, items, totalAmount, orderType,
      packagingFee, platformFee, deliveryFee, amount,
      deliveryLocation, deliveryDetails,
      userId, userName, userEmail, userHall,
    } = req.body;

    if (!canteen || !items || !totalAmount) {
      return res.status(400).json({ error: "canteen, items, and totalAmount are required" });
    }

    const order = await Order.create({
      orderId: uuidv4(),
      canteen,
      canteenId: canteenId || null,
      pickupCode: generateVerificationCode(),
      deliveryCode: generateVerificationCode(),
      items,
      totalAmount,
      packagingFee: packagingFee || 0,
      platformFee: platformFee || 0,
      deliveryFee: deliveryFee || 0,
      amount: amount || totalAmount, // fallback to totalAmount for old versions
      currency: "INR",
      orderType: orderType || "Takeaway",
      deliveryLocation: deliveryLocation || null,
      deliveryDetails: deliveryDetails || null,
      instructions: req.body.instructions || null,
      status: "PENDING_PAYMENT",
      orderStatus: "PLACED",
      userId: userId || null,
      userName: userName || null,
      userEmail: userEmail || null,
      userHall: userHall || null,
      userPhone: req.body.userPhone || null,
    });

    // Capture Canteen Phone if available
    if (canteenId) {
      const canteenDoc = await Canteen.findOne({ canteenId });
      if (canteenDoc && canteenDoc.phone) {
        order.canteenPhone = canteenDoc.phone;
        await order.save();
      }
    }

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
      amount: Math.round(order.amount * 100), // convert to paise
      currency: order.currency || "INR",
      receipt: orderId,
    });

    order.razorpayOrderId = rzpOrder.id;
    await order.save();

    res.json({
      success: true,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
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
        status: "PAID",
        orderStatus: "PLACED",
        paidAt: new Date(),
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

    res.json({
      success: true,
      status: order.status,
      orderStatus: order.orderStatus || "PLACED",
      orderId: order.orderId,
    });

  } catch (err) {
    console.error("GET ORDER STATUS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  PATCH /order/:orderId/status
  Body: { status } — updates the orderStatus (preparation workflow)
  Used by Canteen-owner admin app
*/
app.patch("/order/:orderId/status", async (req, res) => {
  try {
    const { status, estimatedPrepTime, cancellationReason, riderPhone, isRefunded } = req.body;
    const validStatuses = [
      "PLACED", "PREPARING", "READY",
      "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED",
      "CANCELLED",
    ];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const updateData = {};
    if (status) updateData.orderStatus = status;
    if (riderPhone) updateData.riderPhone = riderPhone;
    if (isRefunded !== undefined) updateData.isRefunded = isRefunded;

    // If moving to PREPARING, set timer stuff
    if (status === "PREPARING") {
      updateData.prepStartedAt = new Date();
      if (estimatedPrepTime) {
        updateData.estimatedPrepTime = Number(estimatedPrepTime);
      }
    }

    // Cancellation logic
    if (status === "CANCELLED" && cancellationReason) {
      updateData.cancellationReason = cancellationReason;
    }

    const order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      updateData,
      { new: true }
    );

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json({
      success: true,
      orderId: order.orderId,
      orderStatus: order.orderStatus,
      estimatedPrepTime: order.estimatedPrepTime,
      prepStartedAt: order.prepStartedAt,
    });

  } catch (err) {
    console.error("UPDATE ORDER STATUS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ORDER HISTORY — GET /orders  (optional ?userId=xxx to filter) */
app.get("/orders", async (req, res) => {
  try {
    const filter = {};
    if (req.query.userId) filter.userId = req.query.userId;

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error("GET ORDERS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /orders/:orderId/rate
 * Body: { itemName, score }
 * Rates a specific food item from a delivered order
 */
app.post("/orders/:orderId/rate", async (req, res) => {
  try {
    const { itemName, score } = req.body;
    const { orderId } = req.params;

    if (!itemName || !score || score < 1 || score > 5) {
      return res.status(400).json({ error: "itemName and score (1-5) are required" });
    }

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ error: "Order not found" });

    const completedStatuses = ["DELIVERED", "PICKED_UP"];
    if (!completedStatuses.includes(order.orderStatus)) {
      return res.status(400).json({ error: "Order is not yet completed" });
    }

    if (order.ratedItems && order.ratedItems.includes(itemName)) {
      return res.status(400).json({ error: "Item already rated" });
    }

    // Use stored canteenId if available, fallback to mapping
    const canteenMapping = {
      'AZAD Canteen': 'azad_hall',
      'LLR Canteen': 'llr_canteen',
      'VS Canteen': 'vs_canteen',
      'HJB Canteen': 'hjb_canteen',
      'RK Canteen': 'rk_hall',
      'RP Canteen': 'rp_canteen',
    };
    const canteenId = order.canteenId || canteenMapping[order.canteen] || order.canteen;

    console.log(`Rating: orderId=${orderId}, canteenId=${canteenId}, item=${itemName}, score=${score}`);

    const menuItem = await MenuItem.findOne({ canteenId, name: itemName });
    if (menuItem) {
      menuItem.ratingSum += Number(score);
      menuItem.ratingCount += 1;
      await menuItem.save();
      console.log(`Updated MenuItem: ${itemName}, Count: ${menuItem.ratingCount}, Sum: ${menuItem.ratingSum}`);
    } else {
      console.warn(`MenuItem not found for rating: canteenId=${canteenId}, name=${itemName}`);
    }

    // Also update Canteen rating
    const canteen = await Canteen.findOne({ canteenId });
    if (canteen) {
      canteen.ratingSum += Number(score);
      canteen.ratingCount += 1;
      await canteen.save();
      console.log(`Updated Canteen: ${canteenId}, Count: ${canteen.ratingCount}, Sum: ${canteen.ratingSum}`);
    } else {
      console.warn(`Canteen not found for rating: canteenId=${canteenId}`);
    }

    // Track that this item has been rated
    await Order.findOneAndUpdate(
      { orderId },
      { $push: { ratedItems: itemName } }
    );

    res.json({ success: true, message: "Rating submitted" });

  } catch (err) {
    console.error("RATE ITEM ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* --- Canteen Profile Info --- */
app.get("/menu/canteen/:canteenId", async (req, res) => {
  try {
    const canteen = await Canteen.findOne({ canteenId: req.params.canteenId });
    if (!canteen) return res.status(404).json({ error: "Canteen not found" });
    res.json(canteen);
  } catch (err) {
    console.error("GET CANTEEN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/menu/canteen/:canteenId/phone", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "phone is required" });

    const canteen = await Canteen.findOneAndUpdate(
      { canteenId: req.params.canteenId },
      { phone },
      { new: true }
    );
    if (!canteen) return res.status(404).json({ error: "Canteen not found" });

    // Also update all active orders for this canteen so students see the new number
    await Order.updateMany(
      { canteenId: req.params.canteenId, orderStatus: { $in: ["PLACED", "PREPARING", "READY"] } },
      { canteenPhone: phone }
    );

    res.json({ success: true, phone: canteen.phone });
  } catch (err) {
    console.error("UPDATE CANTEEN PHONE ERROR:", err);
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
        { paymentId: payment.id, status: "PAID", orderStatus: "PLACED", paidAt: new Date() }
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

/* ===================================================== */
/* ================= CONFIG (FEES) ===================== */
/* ===================================================== */

app.get("/config", async (req, res) => {
  try {
    let config = await Config.findOne({});
    if (!config) {
      config = await Config.create({ platformFee: 0, deliveryFee: 0 });
    }
    res.json(config);
  } catch (err) {
    console.error("GET CONFIG ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/config", async (req, res) => {
  try {
    const { platformFee, deliveryFee } = req.body;
    let config = await Config.findOne({});
    if (!config) {
      config = new Config();
    }
    if (platformFee !== undefined) config.platformFee = Number(platformFee);
    if (deliveryFee !== undefined) config.deliveryFee = Number(deliveryFee);
    config.lastUpdated = new Date();
    await config.save();

    res.json({ success: true, config });
  } catch (err) {
    console.error("UPDATE CONFIG ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------ EVENTS ------------------ */

app.get("/events", async (req, res) => {
  try {
    const events = await Event.find().sort({ order: 1, createdAt: -1 });
    res.json(events);
  } catch (err) {
    console.error("GET EVENTS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/events/reorder", async (req, res) => {
  try {
    const { orders } = req.body; // Expecting [{ id, order }, ...]
    if (!orders || !Array.isArray(orders)) return res.status(400).json({ error: "Orders array required" });

    const bulkOps = orders.map(item => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { order: item.order } }
      }
    }));

    await Event.bulkWrite(bulkOps);
    res.json({ success: true });
  } catch (err) {
    console.error("REORDER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/events", async (req, res) => {
  try {
    const { title, date, description, color, icon, links } = req.body;
    if (!title || !date) return res.status(400).json({ error: "title and date are required" });

    const newEvent = await Event.create({ title, date, description, color, icon, links });
    res.status(201).json({ success: true, event: newEvent });
  } catch (err) {
    console.error("CREATE EVENT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/events/:id", async (req, res) => {
  try {
    const updated = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, event: updated });
  } catch (err) {
    console.error("UPDATE EVENT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/events/:id", async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE EVENT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------ IMAGE UPLOAD ------------------ */

app.post("/upload-image", async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) return res.status(400).json({ error: "base64 field is required" });

    const id = uuidv4().substring(0, 12);
    const newImage = new ImageData({ id, base64 });
    await newImage.save();

    const host = req.protocol + "://" + req.get("host");
    const url = `${host}/images/${id}`;
    res.status(201).json({ success: true, url });
  } catch (err) {
    console.error("UPLOAD IMAGE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/images/:id", async (req, res) => {
  try {
    const imgData = await ImageData.findOne({ id: req.params.id });
    if (!imgData) return res.status(404).send("Not found");

    const buffer = Buffer.from(imgData.base64, "base64");
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=31536000");
    res.send(buffer);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

/* ------------------ HEALTH ------------------ */

app.get("/health", (req, res) => res.send("OK"));

/* ------------------ START ------------------ */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 EMAIL_FROM      : ${process.env.EMAIL_FROM || "NOT SET ❌"}`);
  console.log(`🔑 RESEND_API_KEY  : ${process.env.RESEND_API_KEY ? "set ✅" : "NOT SET ❌"}`);
  console.log(`💳 RAZORPAY_KEY_ID : ${process.env.RAZORPAY_KEY_ID ? "set ✅" : "NOT SET ❌"}`);
});
