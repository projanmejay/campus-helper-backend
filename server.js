const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // Helps Flutter talk to your server
require('dotenv').config();

const app = express();

// 1. Middleware
app.use(cors());
app.use(express.json()); // Essential to read req.body from Flutter

// 2. Connect to MongoDB (The link your friend gave you)
const mongoURI = process.env.MONGO_URI || "your_mongodb_link_here";
mongoose.connect(mongoURI)
  .then(() => console.log('✅ Connected to MongoDB Atlas!'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 3. Import and use Taxi Routes
const taxiRoutes = require('./routes/taxiRoutes');
app.use('/', taxiRoutes);

// 4. Basic "I am alive" route
app.get('/', (req, res) => {
  res.send('Campus Helper Backend is Running! 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📡 Server listening on port ${PORT}`);
});
