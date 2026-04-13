const express = require("express");
const router = express.Router();
const TravelRequest = require("../models/TravelRequest");
const RideGroup = require("../models/RideGroup");
const User = require("../models/User");

// ─────────────────────────────────────────────────────────────────────────────
// POST /taxi-sharing/request
// Student creates a travel request
// ─────────────────────────────────────────────────────────────────────────────
router.post("/request", async (req, res) => {
  try {
    const { studentId, source, destination, date, time, fcmToken } = req.body;

    // Check if student already has a pending or assigned request
    const existing = await TravelRequest.findOne({
      studentId,
      status: { $in: ["pending", "assigned"] },
    });

    if (existing) {
      return res.status(400).json({ error: "You already have an active travel request." });
    }

    const user = await User.findById(studentId);
    if (!user) return res.status(404).json({ error: "User not found." });

    const request = await TravelRequest.create({
      studentId,
      studentName: user.name,
      studentPhone: user.phone,
      studentHall: user.hall,
      source,
      destination,
      date,
      time,
      fcmToken: fcmToken || "",
    });

    res.status(201).json(request);
  } catch (err) {
    console.error("POST /request:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /taxi-sharing/pending
// Owner fetches pending requests filtered by destination
// ─────────────────────────────────────────────────────────────────────────────
router.get("/pending", async (req, res) => {
  try {
    const { destination } = req.query;
    let query = { status: "pending" };

    if (destination) {
      // Flexible matching for KGP Station, Hijli, Airport
      query.destination = { $regex: destination, $options: "i" };
    }

    const requests = await TravelRequest.find(query).sort({ date: 1, time: 1 });
    res.json(requests);
  } catch (err) {
    console.error("GET /pending:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /taxi-sharing/create-group
// Owner creates a group from selected requests
// ─────────────────────────────────────────────────────────────────────────────
router.post("/create-group", async (req, res) => {
  try {
    const { ownerId, requestIds, taxiDetails, departureTime } = req.body;

    if (!ownerId || !requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({ error: "ownerId and an array of requestIds are required." });
    }

    const owner = await User.findById(ownerId);
    if (!owner || owner.role !== "owner") {
      return res.status(403).json({ error: "Unauthorized. Only owners can create groups." });
    }

    // Fetch and verify requests are still pending
    const requests = await TravelRequest.find({
      _id: { $in: requestIds },
      status: "pending",
    });

    if (requests.length !== requestIds.length) {
      return res.status(400).json({ error: "One or more requests are no longer available." });
    }

    const studentIds = requests.map((r) => r.studentId);
    const source = requests[0].source;
    const destination = requests[0].destination;

    // Create the RideGroup
    const group = await RideGroup.create({
      ownerId,
      ownerName: owner.name,
      ownerPhone: owner.phone,
      ownerHall: owner.hall,
      studentIds,
      requestIds,
      taxiDetails,
      source,
      destination,
      departureTime: new Date(departureTime),
    });

    // Update students' request status
    await TravelRequest.updateMany(
      { _id: { $in: requestIds } },
      { $set: { status: "assigned" } }
    );

    res.status(201).json({ success: true, groupId: group._id });
  } catch (err) {
    console.error("POST /create-group:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /taxi-sharing/status/:studentId
// Get active request/group for a student
// ─────────────────────────────────────────────────────────────────────────────
router.get("/status/:studentId", async (req, res) => {
  try {
    const request = await TravelRequest.findOne({
      studentId: req.params.studentId,
      status: { $in: ["pending", "assigned"] },
    });

    if (!request) return res.json({ status: "none" });

    if (request.status === "assigned") {
      const group = await RideGroup.findOne({ requestIds: request._id })
        .populate("studentIds", "name phone hall");
      return res.json({ status: "assigned", request, group });
    }

    res.json({ status: "pending", request });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
