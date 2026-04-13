const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
  label: { type: String, required: true },
  url: { type: String, required: true }
}, { _id: false });

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: String, required: true },
  description: { type: String },
  color: { type: String, default: "0xFF6366F1" }, 
  icon: { type: String, default: "event" }, 
  links: [linkSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Event', eventSchema);
