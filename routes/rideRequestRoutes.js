const express     = require("express");
const router      = express.Router();
const crypto      = require("crypto");
const { v4: uuidv4 } = require("uuid");
const cron        = require("node-cron");
const Razorpay    = require("razorpay");
const RideRequest = require("../models/RideRequest");

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const FARE = {
  "KGP Railway Station": 250,
  "Calcutta Airport":    4000,
};
const COMMISSION_RATE  = 0.05;
const MATCH_WINDOW_MS  = 60 * 60 * 1000; // 1 hour
const MAX_GROUP_SIZE   = 4;
const SOLO_DEADLINE_HR = 24;

function upfront(to) {
  const total = FARE[to] || 0;
  return Math.ceil(total / 2) + Math.ceil(total * COMMISSION_RATE);
}
function commission(to)     { return Math.ceil((FARE[to] || 0) * COMMISSION_RATE); }
function refundAmt(to)      { return Math.ceil((FARE[to] || 0) / 4); }
function soloExtra(to)      { return Math.ceil((FARE[to] || 0) / 2); }

// ─────────────────────────────────────────────────────────────────────────────
// Razorpay
// ─────────────────────────────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function createRzpOrder(amountRs, receipt) {
  return razorpay.orders.create({
    amount:   amountRs * 100, // paise
    currency: "INR",
    receipt,
  });
}

async function triggerRefund(paymentId, amountRs) {
  return razorpay.payments.refund(paymentId, { amount: amountRs * 100 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase push (optional)
// ─────────────────────────────────────────────────────────────────────────────
let messaging = null;
try {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(require("../serviceAccountKey.json")) });
  }
  messaging = admin.messaging();
  console.log("✅ Firebase Admin ready");
} catch (e) {
  console.warn("⚠️  Firebase Admin not loaded — push notifications disabled:", e.message);
}

async function sendPush(token, title, body) {
  if (!messaging || !token) return;
  try {
    await messaging.send({ token, notification: { title, body }, android: { priority: "high" } });
  } catch (e) {
    console.error("FCM error:", e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /ride-requests
// Create request + Razorpay order for upfront payment
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { userId, userName, userPhone, userEmail, userRoll, fcmToken, from, to, dateTime } = req.body;

    if (!userId || !from || !to || !dateTime) {
      return res.status(400).json({ error: "userId, from, to, dateTime are required" });
    }
    if (!FARE[to]) {
      return res.status(400).json({ error: "Invalid destination" });
    }

    const amt     = upfront(to);
    const comm    = commission(to);
    const receipt = `ride_${uuidv4().slice(0, 8)}`;

    // Create Razorpay order
    const rzpOrder = await createRzpOrder(amt, receipt);

    // Save ride request (unpaid until verify-payment is called)
    const request = await RideRequest.create({
      userId, userName, userPhone, userEmail, userRoll, fcmToken,
      from, to,
      dateTime: new Date(dateTime),
      amountPaid:      amt,
      commission:      comm,
      razorpayOrderId: rzpOrder.id,
      status:          "pending",
    });

    res.status(201).json({
      requestId:    request._id,
      amountPaid:   amt,
      razorpayOrder: {
        id:       rzpOrder.id,
        amount:   rzpOrder.amount,
        currency: rzpOrder.currency,
        key:      process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (err) {
    console.error("POST /ride-requests:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /ride-requests/:id/verify-payment
// Verify Razorpay signature after user pays upfront amount
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/verify-payment", async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    // Allow test_signature to pass in dev — remove in production
    const isTest = razorpay_signature === "test_signature";
    if (!isTest && expected !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const request = await RideRequest.findByIdAndUpdate(
      req.params.id,
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paymentVerified:   true,
      },
      { new: true }
    );

    if (!request) return res.status(404).json({ error: "Request not found" });

    res.json({ success: true, message: "Payment verified. We'll notify you when matched." });
  } catch (err) {
    console.error("verify-payment:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ride-requests/user/:userId
// User's own bookings for "My Bookings" tab
// ─────────────────────────────────────────────────────────────────────────────
router.get("/user/:userId", async (req, res) => {
  try {
    const requests = await RideRequest
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ride-requests/all  — admin view
// ─────────────────────────────────────────────────────────────────────────────
router.get("/all", async (req, res) => {
  try {
    const requests = await RideRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /ride-requests/:id/solo-decision
// User decides: pay full or opt out (called from solo_decision status card)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/solo-decision", async (req, res) => {
  try {
    const { payFull } = req.body;
    const request = await RideRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Not found" });
    if (request.status !== "solo_decision") {
      return res.status(400).json({ error: "Request is not in solo_decision state" });
    }

    if (!payFull) {
      // Opt out — full refund (fare portion only, commission kept)
      const refund = request.amountPaid - request.commission;
      let refundId = null;
      if (request.razorpayPaymentId && !request.razorpayPaymentId.startsWith("pay_test")) {
        const rzpRefund = await triggerRefund(request.razorpayPaymentId, refund);
        refundId = rzpRefund.id;
      }
      await RideRequest.findByIdAndUpdate(req.params.id, {
        status:          "cancelled",
        refundAmount:    refund,
        refundId,
        refundProcessed: !!refundId,
      });
      await sendPush(request.fcmToken, "❌ Booking Cancelled",
        `Your ride request has been cancelled. ₹${refund} will be refunded in 5–7 business days.`);
      return res.json({ success: true, refunded: refund });
    }

    // Pay full — create Razorpay order for extra amount
    const extra    = soloExtra(request.to);
    const rzpOrder = await createRzpOrder(extra, `solo_${request._id}`);
    await RideRequest.findByIdAndUpdate(req.params.id, {
      soloExtraOrderId: rzpOrder.id,
    });
    res.json({
      success: true,
      razorpayOrderId: rzpOrder.id,
      amount:  extra,
      key:     process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("solo-decision:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /ride-requests/:id  — cancel unpaid request
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    await RideRequest.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CRON JOB — Runs every day at 10:00 AM
// Processes all rides happening exactly 2 days from now
// ─────────────────────────────────────────────────────────────────────────────
cron.schedule("0 10 * * *", async () => {
  console.log("🕙 Cron: Running taxi assignment job...");

  const now         = new Date();
  const targetStart = new Date(now);
  targetStart.setDate(targetStart.getDate() + 2);
  targetStart.setHours(0, 0, 0, 0);

  const targetEnd = new Date(targetStart);
  targetEnd.setHours(23, 59, 59, 999);

  try {
    // Get all paid pending/matched requests for rides 2 days from now
    const requests = await RideRequest.find({
      status:          { $in: ["pending", "matched"] },
      paymentVerified: true,
      dateTime:        { $gte: targetStart, $lte: targetEnd },
    }).sort({ dateTime: 1 });

    console.log(`  Found ${requests.length} requests to process`);

    // Group by route (from+to) and time window (±1hr)
    const processed = new Set();

    for (const req of requests) {
      if (processed.has(req._id.toString())) continue;

      // Find all requests that match this one (same from+to, within ±1hr)
      const group = requests.filter((r) => {
        if (processed.has(r._id.toString())) return false;
        if (r.from !== req.from || r.to !== req.to) return false;
        return Math.abs(new Date(r.dateTime) - new Date(req.dateTime)) <= MATCH_WINDOW_MS;
      }).slice(0, MAX_GROUP_SIZE);

      const groupId   = uuidv4();
      const groupSize = group.length;
      const groupIds  = group.map((r) => r._id.toString());

      console.log(`  Group: ${groupSize} people | ${req.from} → ${req.to}`);

      if (groupSize === 1) {
        // Solo — give user 24 hours to decide
        const deadline = new Date(now.getTime() + SOLO_DEADLINE_HR * 60 * 60 * 1000);
        await RideRequest.findByIdAndUpdate(req._id, {
          status:               "solo_decision",
          groupId,
          groupSize:            1,
          soloDecisionDeadline: deadline,
        });
        await sendPush(req.fcmToken, "⚠️ No Co-passengers Found",
          `No one else is travelling ${req.from} → ${req.to} around your time. ` +
          `Open the app to choose: pay ₹${soloExtra(req.to)} more or get a full refund. You have 24 hours.`);
      } else {
        // 2 or 4 people — assign group
        let refund = 0;
        if (groupSize === MAX_GROUP_SIZE) refund = refundAmt(req.to);

        for (const r of group) {
          const otherIds = groupIds.filter((id) => id !== r._id.toString());
          const update = {
            status:      "matched",
            groupId,
            groupSize,
            matchedWith: otherIds,
          };
          await RideRequest.findByIdAndUpdate(r._id, update);
          processed.add(r._id.toString());
        }

        // Process refunds for 4-person groups
        if (refund > 0) {
          for (const r of group) {
            if (r.razorpayPaymentId && !r.razorpayPaymentId.startsWith("pay_test")) {
              try {
                const rzpRefund = await triggerRefund(r.razorpayPaymentId, refund);
                await RideRequest.findByIdAndUpdate(r._id, {
                  refundAmount:    refund,
                  refundId:        rzpRefund.id,
                  refundProcessed: true,
                });
              } catch (e) {
                console.error(`  Refund failed for ${r._id}:`, e.message);
              }
            } else {
              await RideRequest.findByIdAndUpdate(r._id, { refundAmount: refund });
            }
            await sendPush(r.fcmToken, "🚖 Cab Assigned!",
              `Your cab for ${r.from} → ${r.to} is confirmed with ${groupSize} passengers! ` +
              `₹${refund} has been refunded to you.`);
          }
        } else {
          for (const r of group) {
            await sendPush(r.fcmToken, "🚖 Cab Assigned!",
              `Your cab for ${r.from} → ${r.to} is confirmed with ${groupSize} passengers!`);
          }
        }
      }
    }

    // ── Auto-cancel expired solo_decision requests ──────────────────────────
    const expiredSolos = await RideRequest.find({
      status:               "solo_decision",
      soloDecisionDeadline: { $lt: now },
    });

    for (const r of expiredSolos) {
      const refund = r.amountPaid - r.commission;
      let refundId = null;
      if (r.razorpayPaymentId && !r.razorpayPaymentId.startsWith("pay_test")) {
        try {
          const rzpRefund = await triggerRefund(r.razorpayPaymentId, refund);
          refundId = rzpRefund.id;
        } catch (e) {
          console.error("Auto-cancel refund error:", e.message);
        }
      }
      await RideRequest.findByIdAndUpdate(r._id, {
        status:          "cancelled",
        refundAmount:    refund,
        refundId,
        refundProcessed: !!refundId,
      });
      await sendPush(r.fcmToken, "❌ Booking Auto-Cancelled",
        `You didn't respond in time. Your ride request was cancelled and ₹${refund} will be refunded.`);
      console.log(`  Auto-cancelled solo: ${r._id}`);
    }

    console.log("✅ Cron job complete");
  } catch (err) {
    console.error("❌ Cron job error:", err);
  }
});

module.exports = router;
