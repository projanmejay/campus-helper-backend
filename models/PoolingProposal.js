const mongoose = require("mongoose");

const poolingProposalSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "PoolingGroup", required: true },
    driverName: { type: String, required: true },
    driverPhone: { type: String, required: true },
    cabNumber: { type: String, required: true },
    // Tracks which users in the group have accepted the proposal
    acceptedBy: [{ type: String }], 
    status: { 
      type: String, 
      enum: ["PENDING", "ACCEPTED", "REJECTED"], 
      default: "PENDING" 
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PoolingProposal", poolingProposalSchema);
