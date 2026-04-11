const express = require("express");
const router = express.Router();
const Canteen = require("../models/Canteen");
const MenuItem = require("../models/MenuItem");

/**
 * @route GET /menu/canteens
 * @desc  Fetch all canteens
 */
router.get("/canteens", async (req, res) => {
  try {
    const rawCanteens = await Canteen.find().sort({ name: 1 });
    const canteens = rawCanteens.map(c => ({
      ...c.toObject(),
      id: c.canteenId // For student app compatibility
    }));
    res.json({ canteens });
  } catch (err) {
    console.error("GET CANTEENS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route GET /menu/:canteenId
 * @desc  Fetch menu for a specific canteen, organized by categories
 */
router.get("/:canteenId", async (req, res) => {
  try {
    const { canteenId } = req.params;
    const items = await MenuItem.find({ canteenId }).sort({ category: 1, name: 1 });

    // Group items by category to match the frontend 'sections' structure
    const sectionsMap = {};
    items.forEach(item => {
      const cat = item.category || "General";
      if (!sectionsMap[cat]) {
        sectionsMap[cat] = { title: cat, items: [] };
      }
      sectionsMap[cat].items.push(item);
    });

    res.json({ sections: Object.values(sectionsMap) });
  } catch (err) {
    console.error("GET MENU ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route PATCH /menu/canteen/:canteenId/status
 * @desc  Toggle open/closed status (Admin)
 */
router.patch("/canteen/:canteenId/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["Open", "Closed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const canteen = await Canteen.findOneAndUpdate(
      { canteenId: req.params.canteenId },
      { status },
      { new: true }
    );

    if (!canteen) return res.status(404).json({ error: "Canteen not found" });

    res.json({ success: true, status: canteen.status });
  } catch (err) {
    console.error("UPDATE CANTEEN STATUS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route POST /menu/:canteenId
 * @desc  Add new menu item (Admin)
 */
router.post("/:canteenId", async (req, res) => {
  try {
    const { canteenId } = req.params;
    const { category, name, price, isVeg, id } = req.body;

    if (!category || !name || !price || !id) {
      return res.status(400).json({ error: "category, name, price, and id are required" });
    }

    // Ensure Canteen exists
    let canteen = await Canteen.findOne({ canteenId });
    if (!canteen) {
      // Create a default canteen entry if it doesn't exist
      // In a real app, this would be more detailed
      canteen = await Canteen.create({
        canteenId,
        name: canteenId.replace("_", " ").toUpperCase(), // Fallback name
      });
    }

    // Upsert the menu item
    let item = await MenuItem.findOneAndUpdate(
      { canteenId, id },
      { category, name, price, isVeg },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, item });
  } catch (err) {
    console.error("ADD MENU ITEM ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route PATCH /menu/item/:mongoId
 * @desc  Update item (price, availability) (Admin)
 */
router.patch("/item/:mongoId", async (req, res) => {
  try {
    const { price, isAvailable } = req.body;
    const updateData = {};
    if (price !== undefined) updateData.price = price;
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable;

    const item = await MenuItem.findByIdAndUpdate(
      req.params.mongoId,
      updateData,
      { new: true }
    );

    if (!item) return res.status(404).json({ error: "Item not found" });

    res.json({ success: true, item });
  } catch (err) {
    console.error("UPDATE MENU ITEM ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
