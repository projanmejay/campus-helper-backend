const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: "PoolingRequest" }
});

const poolingGroupSchema = new mongoose.Schema(
  {
    destination: { type: String, required: true },
    scheduledTime: { type: Date, required: true },
    members: [memberSchema],
    status: { 
      type: String, 
      enum: ["WAITING_FOR_CAB", "CAB_PROPOSED", "CONFIRMED"], 
      default: "WAITING_FOR_CAB" 
    },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: "PoolingProposal", default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PoolingGroup", poolingGroupSchema);
