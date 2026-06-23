const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const { adminAuthenticate } = require("../middleware/admin_auth");

// GET /events (Public) - fetch all events sorted by order
router.get("/", async (req, res) => {
  try {
    const events = await Event.find().sort({ order: 1, createdAt: -1 });
    res.json(events);
  } catch (err) {
    console.error("GET EVENTS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /events - create a new event
router.post("/", adminAuthenticate, async (req, res) => {
  try {
    const { title, date, description, links } = req.body;
    
    if (!title || !date) {
      return res.status(400).json({ error: "Title and date are required" });
    }

    const event = await Event.create({
      title,
      date,
      description,
      links: links || []
    });

    res.status(201).json(event);
  } catch (err) {
    console.error("CREATE EVENT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /events/reorder - update the order of events
router.post("/reorder", adminAuthenticate, async (req, res) => {
  try {
    const { orders } = req.body;
    
    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({ error: "Orders array is required" });
    }

    // Process all updates in parallel
    await Promise.all(
      orders.map(async (o) => {
        if (o._id && o.order !== undefined) {
          await Event.findByIdAndUpdate(o._id, { order: o.order });
        }
      })
    );

    res.json({ success: true });
  } catch (err) {
    console.error("REORDER EVENTS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /events/:id - update an event
router.put("/:id", adminAuthenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const event = await Event.findByIdAndUpdate(id, updateData, { new: true });
    
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(event);
  } catch (err) {
    console.error("UPDATE EVENT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /events/:id - delete an event
router.delete("/:id", adminAuthenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const event = await Event.findByIdAndDelete(id);
    
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json({ success: true, message: "Event deleted" });
  } catch (err) {
    console.error("DELETE EVENT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
