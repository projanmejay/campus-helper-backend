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


/* ------------------ HEALTH ------------------ */

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

/* ------------------ START SERVER ------------------ */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});