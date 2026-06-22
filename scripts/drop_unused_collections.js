const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/campus-helper';

const collectionsToDrop = [
  'poolinggroups',
  'poolingproposals',
  'poolingrequests',
  'riderequests',
  'riderlocations',
  'rides',
];

(async () => {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✅ Connected to MongoDB');
    for (const col of collectionsToDrop) {
      const exists = await mongoose.connection.db.listCollections({ name: col }).hasNext();
      if (exists) {
        await mongoose.connection.db.dropCollection(col);
        console.log(`🗑️ Dropped collection ${col}`);
      } else {
        console.log(`⚠️ Collection ${col} does not exist`);
      }
    }
    await mongoose.disconnect();
    console.log('✅ Cleanup complete');
  } catch (err) {
    console.error('❌ Cleanup failed', err);
    process.exit(1);
  }
})();
