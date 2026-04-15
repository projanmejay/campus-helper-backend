const mongoose = require("mongoose");

const joinRequestSchema = new mongoose.Schema(
  {
    joinerReqId: { type: mongoose.Schema.Types.ObjectId, ref: 'PoolRequest', required: true },
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
