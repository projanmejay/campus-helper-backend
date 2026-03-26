const express      = require("express");
const router       = express.Router();
const RideRequest  = require("../models/RideRequest");

// ─────────────────────────────────────────────────────────────────────────────
// FCM helper — requires firebase-admin + serviceAccountKey.json in project root
// Run once:  npm install firebase-admin
// ─────────────────────────────────────────────────────────────────────────────
let messaging = null;
try {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    const serviceAccount = require("../serviceAccountKey.json");
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  messaging = admin.messaging();
  console.log("✅ Firebase Admin initialised — push notifications enabled");
} catch (e) {
  console.warn("⚠️  Firebase Admin not initialised — push notifications disabled:", e.message);
}

async function sendPush(fcmToken, title, body) {
  if (!messaging || !fcmToken) return;
  try {
    await messaging.send({
      token:        fcmToken,
      notification: { title, body },
      android:      { priority: "high" },
      apns:         { payload: { aps: { sound: "default" } } },
    });
    console.log(`📲 Push sent → ${fcmToken.slice(0, 20)}...`);
  } catch (err) {
    console.error("FCM send error:", err.message);
  }
}

const MATCH_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ─────────────────────────────────────────────────────────────────────────────
// POST /ride-requests
// Create a ride request and auto-match with existing pending ones
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      userId, userName, userPhone, userEmail, userRoll, fcmToken,
      from, to, dateTime, passengers,
    } = req.body;

    if (!userId || !userName || !from || !to || !dateTime || !passengers) {
      return res.status(400).json({ error: "userId, userName, from, to, dateTime, passengers are required" });
    }

    const requestedTime = new Date(dateTime);

    // ── Find matching pending requests ────────────────────────────────────────
    // Same from + to, within ±1 hour, different user, still pending
    const candidates = await RideRequest.find({
      status:   "pending",
      from,
      to,
      userId:   { $ne: userId },
      dateTime: {
        $gte: new Date(requestedTime.getTime() - MATCH_WINDOW_MS),
        $lte: new Date(requestedTime.getTime() + MATCH_WINDOW_MS),
      },
    });

    const matchedIds = candidates.map((c) => c._id.toString());
    const isMatched  = matchedIds.length > 0;
    const status     = isMatched ? "matched" : "pending";

    // ── Create this user's request ────────────────────────────────────────────
    const newRequest = await RideRequest.create({
      userId, userName, userPhone, userEmail, userRoll, fcmToken,
      from, to,
      dateTime:    requestedTime,
      passengers,
      status,
      matchedWith: matchedIds,
    });

    // ── Update matched candidates to include this new request ─────────────────
    if (isMatched) {
      await RideRequest.updateMany(
        { _id: { $in: matchedIds } },
        {
          $set:  { status: "matched" },
          $push: { matchedWith: newRequest._id.toString() },
        }
      );

      // Notify all matched candidates
      for (const candidate of candidates) {
        await sendPush(
          candidate.fcmToken,
          "🚖 Ride Match Found!",
          `You've been matched with a co-passenger for ${from} → ${to}. Admin will assign a driver soon.`
        );
      }

      // Notify the new requester
      await sendPush(
        fcmToken,
        "🚖 Ride Match Found!",
        `You've been matched with ${matchedIds.length} co-passenger(s) for ${from} → ${to}!`
      );
    }

    res.status(201).json({ success: true, request: newRequest });

  } catch (err) {
    console.error("POST /ride-requests ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ride-requests
// All pending requests (Flutter uses this for client-side match preview)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const requests = await RideRequest.find({ status: "pending" }).sort({ dateTime: 1 });
    res.json(requests);
  } catch (err) {
    console.error("GET /ride-requests ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ride-requests/user/:userId
// All requests for a specific user — shown in "My Requests" tab
// ─────────────────────────────────────────────────────────────────────────────
router.get("/user/:userId", async (req, res) => {
  try {
    const requests = await RideRequest
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error("GET /ride-requests/user ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ride-requests/all
// All requests regardless of status — for admin panel
// ─────────────────────────────────────────────────────────────────────────────
router.get("/all", async (req, res) => {
  try {
    const requests = await RideRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error("GET /ride-requests/all ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /ride-requests/:id/assign-driver
// Admin assigns a driver to a matched group — notifies all matched users
// Body: { driverName, driverNumber }
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/assign-driver", async (req, res) => {
  try {
    const { driverName, driverNumber } = req.body;

    if (!driverName || !driverNumber) {
      return res.status(400).json({ error: "driverName and driverNumber are required" });
    }

    const request = await RideRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found" });

    // Collect all IDs in this matched group (this request + all matched with it)
    const groupIds = [req.params.id, ...request.matchedWith];

    // Update every request in the group
    await RideRequest.updateMany(
      { _id: { $in: groupIds } },
      { $set: { status: "driver_assigned", driverName, driverNumber } }
    );

    // Send push notification to every user in the group
    const groupRequests = await RideRequest.find({ _id: { $in: groupIds } });
    for (const r of groupRequests) {
      await sendPush(
        r.fcmToken,
        "✅ Driver Assigned!",
        `Your driver ${driverName} has been assigned for ${r.from} → ${r.to}. Contact: ${driverNumber}`
      );
    }

    res.json({ success: true, message: `Driver assigned to ${groupIds.length} request(s)` });

  } catch (err) {
    console.error("PATCH /assign-driver ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /ride-requests/:id/match
// Flutter calls this to update other matched requests when a new one is posted
// Body: { matchedWithId, status }
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/match", async (req, res) => {
  try {
    const { matchedWithId, status } = req.body;

    const request = await RideRequest.findByIdAndUpdate(
      req.params.id,
      {
        $set:  { status: status || "matched" },
        $push: { matchedWith: matchedWithId },
      },
      { new: true }
    );

    if (!request) return res.status(404).json({ error: "Request not found" });

    res.json({ success: true, request });

  } catch (err) {
    console.error("PATCH /match ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
