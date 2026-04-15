const mongoose = require("mongoose");

const joinRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userPhone: { type: String, required: true },
    pickup: { type: String, required: true },

    targetReqId: { type: mongoose.Schema.Types.ObjectId, ref: 'PoolRequest', required: true },
    
    proposedTime: { type: Date },
    
    // pending -> accepted or rejected
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("JoinRequest", joinRequestSchema);
