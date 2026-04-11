const axios = require("axios");
const fs = require("fs");
const path = require("path");

// The live backend URL from bus_loc/lib/main.dart
const BACKEND_URL = "https://campus-helper-backend-0a0j.onrender.com";
// Path to the repository containing the JSON files
const DATA_DIR = "d:/swabhiman/Code/GitHub/campus-helper-menu-backend";

async function migrate() {
  try {
    console.log("🚀 Starting API-based Migration...");

    // 1. Read canteens.json
    const canteensPath = path.join(DATA_DIR, "canteens.json");
    const canteensData = JSON.parse(fs.readFileSync(canteensPath, "utf8"));
    const canteens = canteensData.canteens;

    for (const c of canteens) {
      console.log(`📦 Processing Canteen: ${c.name} (${c.id})`);
      
      // Note: We don't have a specific "Create Canteen" API endpoint yet in the routes I added,
      // but we have POST /menu/:canteenId which adds items.
      // I'll assume we need one more endpoint or we just migrate items.
      // Actually, I should add a POST /menu/canteen endpoint to initialize the canteen if not exists.

      // 2. Read Menu for this canteen
      const menuPath = path.join(DATA_DIR, `${c.id}.json`);
      if (!fs.existsSync(menuPath)) {
        console.warn(`  ⚠️ No menu file found for ${c.id}`);
        continue;
      }

      const menuData = JSON.parse(fs.readFileSync(menuPath, "utf8"));
      
      // Handle both formats: { sections: [...] } and { menu: [...] }
      if (menuData.sections) {
        for (const section of menuData.sections) {
          console.log(`  📂 Section: ${section.title}`);
          for (const item of section.items) {
            await uploadItem(c.id, item, section.title);
          }
        }
      } else if (menuData.menu) {
        console.log(`  📂 Flat Menu List`);
        for (const item of menuData.menu) {
          await uploadItem(c.id, item, "General");
        }
      }
    }

    console.log("✨ Migration Complete!");
  } catch (err) {
    console.error("❌ Migration Failed:", err);
  }
}

async function uploadItem(canteenId, item, category) {
  try {
    await axios.post(`${BACKEND_URL}/menu/${canteenId}`, {
      category: category,
      name: item.name,
      price: item.price,
      isVeg: item.isVeg !== undefined ? item.isVeg : true,
      id: item.id
    });
    console.log(`    ✅ Added: ${item.name}`);
  } catch (itemErr) {
    if (itemErr.response?.status === 502) {
      console.warn(`    ⏳ Retrying (502): ${item.name}`);
      // Simple one-time retry for Render timeouts
      return uploadItem(canteenId, item, category);
    }
    console.error(`    ❌ Failed: ${item.name} -> ${itemErr.response?.data?.error || itemErr.message}`);
  }
}

migrate();
