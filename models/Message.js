const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderUsername: { type: String, required: true, index: true },
  receiverUsername: { type: String, required: true, index: true },
  text: { type: String, required: true },
  read: { type: Boolean, default: false }
}, { timestamps: true });

// Create compound index for fast thread querying
messageSchema.index({ senderUsername: 1, receiverUsername: 1 });

module.exports = mongoose.model("Message", messageSchema);
