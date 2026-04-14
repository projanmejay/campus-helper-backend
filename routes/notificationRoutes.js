const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");

/* ================= GET NOTIFICATIONS FOR USER ================= */
router.get("/:email", async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientEmail: req.params.email })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= GET UNREAD COUNT ================= */
router.get("/unread-count/:email", async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipientEmail: req.params.email, read: false });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= MARK ALL AS READ ================= */
router.post("/mark-read/:email", async (req, res) => {
  try {
    await Notification.updateMany({ recipientEmail: req.params.email, read: false }, { $set: { read: true } });
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= MARK SINGLE AS READ ================= */
router.post("/mark-one-read/:id", async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { $set: { read: true } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
