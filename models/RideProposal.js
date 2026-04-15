const mongoose = require("mongoose");

const rideProposalSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'RideGroup', required: true },
    
    driverName: { type: String, required: true },
    driverPhone: { type: String, required: true },
    pickupTime: { type: Date, required: true },
    
    // List of userIds who accepted
    acceptedBy: [{ type: String }],
    
    // pending -> fully_accepted -> rejected
    status: {
      type: String,
      enum: ["pending", "fully_accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RideProposal", rideProposalSchema);
