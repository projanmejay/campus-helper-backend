const mongoose = require("mongoose");

const poolRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userPhone: { type: String, required: true },
    
    pickup: { type: String, required: true },
    destination: { type: String, required: true },
    preferredTime: { type: Date, required: true },
    
    // pending -> grouped -> assigned
    // or cancelled
    status: {
      type: String,
      enum: ["pending", "grouped", "assigned", "cancelled"],
      default: "pending",
    },
    
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'RideGroup', default: null },
    isHost: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PoolRequest", poolRequestSchema);
