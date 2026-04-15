const mongoose = require("mongoose");

const rideGroupSchema = new mongoose.Schema(
  {
    destination: { type: String, required: true },
    agreedTime: { type: Date, required: true },
    
    requests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PoolRequest' }],
    users: [{
      userId: String,
      userName: String,
      userPhone: String,
    }],
    
    // forming -> pending_proposal -> confirmed
    status: {
      type: String,
      enum: ["forming", "pending_proposal", "confirmed"],
      default: "forming",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RideGroup", rideGroupSchema);
