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
 * @route PATCH /menu/canteen/:canteenId/status
 * @desc  Update canteen status (Admin)
 */
router.patch("/canteen/:canteenId/status", async (req, res) => {
  try {
    const { status } = req.body;
    let canteen = await Canteen.findOneAndUpdate(
      { canteenId: req.params.canteenId },
      { status },
      { new: true }
    );
    if (!canteen) return res.status(404).json({ error: "Canteen not found" });
    res.json({ success: true, canteen });
  } catch (err) {
    console.error("UPDATE CANTEEN STATUS ERROR:", err);
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
    // Sort by sectionOrder then itemOrder
    const items = await MenuItem.find({ canteenId }).sort({ sectionOrder: 1, itemOrder: 1, name: 1 });

    // Group items by category to match the frontend 'sections' structure
    // We must maintain the order of categories as they appear in the sorted items list
    const sections = [];
    const sectionsMap = {};

    items.forEach(item => {
      const cat = item.category || "General";
      if (!sectionsMap[cat]) {
        sectionsMap[cat] = { title: cat, items: [], sectionOrder: item.sectionOrder };
        sections.push(sectionsMap[cat]);
      }
      sectionsMap[cat].items.push(item);
    });

    res.json({ sections });
  } catch (err) {
    console.error("GET MENU ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route PUT /menu/:canteenId/reorder
 * @desc  Bulk update reorder for items/sections (Admin)
 */
router.put("/:canteenId/reorder", async (req, res) => {
  try {
    const { canteenId } = req.params;
    const { updates } = req.body; // Array of { mongoId (optional), category (optional), sectionOrder, itemOrder, id (slug ID) }

    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: "updates array is required" });
    }

    const bulkOps = updates.map(update => {
      const filter = update.mongoId ? { _id: update.mongoId } : { canteenId, id: update.id };
      const updateFields = {};
      if (update.sectionOrder !== undefined) updateFields.sectionOrder = update.sectionOrder;
      if (update.itemOrder !== undefined) updateFields.itemOrder = update.itemOrder;
      if (update.category !== undefined) updateFields.category = update.category;

      return {
        updateOne: {
          filter,
          update: { $set: updateFields }
        }
      };
    });

    await MenuItem.bulkWrite(bulkOps);

    res.json({ success: true });
  } catch (err) {
    console.error("REORDER BULK ERROR:", err);
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

    // Find the current max itemOrder in this category to append to the end
    const lastItem = await MenuItem.findOne({ canteenId, category }).sort({ itemOrder: -1 });
    const nextItemOrder = lastItem ? lastItem.itemOrder + 1 : 0;

    // Find the sectionOrder for this category if it exists
    const someItemInCat = await MenuItem.findOne({ canteenId, category });
    const sectionOrder = someItemInCat ? someItemInCat.sectionOrder : 0;

    // Ensure Canteen exists
    let canteen = await Canteen.findOne({ canteenId });
    if (!canteen) {
      canteen = await Canteen.create({
        canteenId,
        name: canteenId.replace("_", " ").toUpperCase(),
      });
    }

    // Upsert the menu item
    let item = await MenuItem.findOneAndUpdate(
      { canteenId, id },
      { category, name, price, isVeg, itemOrder: nextItemOrder, sectionOrder },
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
 * @desc  Update item (name, price, isVeg, availability, category) (Admin)
 */
router.patch("/item/:mongoId", async (req, res) => {
  try {
    const { name, price, isVeg, isAvailable, category } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (price !== undefined) updateData.price = price;
    if (isVeg !== undefined) updateData.isVeg = isVeg;
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable;
    if (category !== undefined) updateData.category = category;

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

/**
 * @route DELETE /menu/item/:mongoId
 * @desc  Delete menu item (Admin)
 */
router.delete("/item/:mongoId", async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.mongoId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json({ success: true, message: "Item deleted" });
  } catch (err) {
    console.error("DELETE MENU ITEM ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
