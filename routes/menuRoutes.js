const express = require('express');
const router = express.Router();
const Canteen = require('../models/Canteen');
const MenuItem = require('../models/MenuItem');

const DEFAULT_CANTEENS = [
  { id: 'azad_hall', name: 'AZAD Canteen' },
  { id: 'llr_canteen', name: 'LLR Canteen' },
  { id: 'vs_canteen', name: 'VS Canteen' },
  { id: 'hjb_canteen', name: 'HJB Canteen' },
  { id: 'rk_hall', name: 'RK Canteen' },
  { id: 'rp_canteen', name: 'RP Canteen' },
];

// GET /menu/canteens - Fetch all canteens
router.get('/canteens', async (req, res) => {
  try {
    let canteens = await Canteen.find();
    
    // Seed canteens if empty
    if (canteens.length === 0) {
      await Canteen.insertMany(DEFAULT_CANTEENS);
      canteens = await Canteen.find();
    }
    
    // Always return a guaranteed string `id` field (not just `_id`)
    const canteenList = canteens.map(c => {
      const obj = c.toObject();
      obj.id = obj.id || obj._id.toString();
      return obj;
    });
    
    res.json({ canteens: canteenList });
  } catch (err) {
    console.error('GET CANTEENS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// GET /menu/canteen/:canteenId - Get specific canteen profile
router.get('/canteen/:canteenId', async (req, res) => {
  try {
    const canteen = await Canteen.findOne({ id: req.params.canteenId });
    if (!canteen) return res.status(404).json({ error: 'Canteen not found' });
    res.json(canteen);
  } catch (err) {
    console.error('GET CANTEEN PROFILE ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /menu/canteen/:canteenId/status
router.patch('/canteen/:canteenId/status', async (req, res) => {
  try {
    const { status } = req.body;
    await Canteen.findOneAndUpdate({ id: req.params.canteenId }, { status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /menu/canteen/:canteenId/fee
router.patch('/canteen/:canteenId/fee', async (req, res) => {
  try {
    const { packagingFee } = req.body;
    await Canteen.findOneAndUpdate({ id: req.params.canteenId }, { packagingFee });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /menu/canteen/:canteenId/phone
router.patch('/canteen/:canteenId/phone', async (req, res) => {
  try {
    const { phone } = req.body;
    await Canteen.findOneAndUpdate({ id: req.params.canteenId }, { phone });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /menu/:canteenId - Get menu structured in sections
router.get('/:canteenId', async (req, res) => {
  try {
    const items = await MenuItem.find({ canteenId: req.params.canteenId });
    
    // Group by category
    const sectionMap = {};
    for (const item of items) {
      const itemObj = item.toObject();
      // Always guarantee a string `id` for the Flutter app
      itemObj.id = (itemObj.id && itemObj.id !== '') ? itemObj.id : itemObj._id.toString();
      // Also expose _id as string for Canteen Owner app reorder operations
      itemObj._id = itemObj._id.toString();

      if (!sectionMap[itemObj.category]) {
        sectionMap[itemObj.category] = {
          title: itemObj.category,
          sectionOrder: itemObj.sectionOrder || 0,
          items: []
        };
      }
      sectionMap[itemObj.category].items.push(itemObj);
    }
    
    const sections = Object.values(sectionMap);
    sections.sort((a, b) => a.sectionOrder - b.sectionOrder);
    for (const section of sections) {
      section.items.sort((a, b) => a.itemOrder - b.itemOrder);
    }
    
    res.json({ sections });
  } catch (err) {
    console.error('GET MENU ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// POST /menu/:canteenId - Add new menu item
router.post('/:canteenId', async (req, res) => {
  try {
    const { canteenId } = req.params;
    const { id, category, name, price, isVeg } = req.body;
    
    const item = await MenuItem.create({
      id,
      canteenId,
      category,
      name,
      price,
      isVeg
    });
    
    res.status(201).json(item);
  } catch (err) {
    console.error('ADD MENU ITEM ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /menu/:canteenId/reorder - Update ordering of items and sections
router.put('/:canteenId/reorder', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'Updates array required' });
    
    await Promise.all(
      updates.map(async (u) => {
        const updateData = {};
        if (u.itemOrder !== undefined) updateData.itemOrder = u.itemOrder;
        if (u.sectionOrder !== undefined) updateData.sectionOrder = u.sectionOrder;
        
        await MenuItem.findByIdAndUpdate(u.mongoId, updateData);
      })
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('REORDER MENU ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /menu/item/:mongoId - Update a specific menu item
router.patch('/item/:mongoId', async (req, res) => {
  try {
    const updateData = req.body;
    await MenuItem.findByIdAndUpdate(req.params.mongoId, updateData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /menu/item/:mongoId - Delete a specific menu item
router.delete('/item/:mongoId', async (req, res) => {
  try {
    await MenuItem.findByIdAndDelete(req.params.mongoId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
