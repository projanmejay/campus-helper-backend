const express = require("express");
const router = express.Router();
const PoolRequest = require("../models/PoolRequest");
const RideGroup = require("../models/RideGroup");
const RideProposal = require("../models/RideProposal");
const JoinRequest = require("../models/JoinRequest");

// -------------------------------------------------------------
// STUDENT APP ENDPOINTS
// -------------------------------------------------------------

// Create a new pool request
router.post("/request", async (req, res) => {
  try {
    const { userId, userName, userPhone, pickup, destination, preferredTime } = req.body;
    
    const preferredDate = new Date(preferredTime);
    if (preferredDate < new Date()) {
      return res.status(400).json({ error: "Preferred time must be in the future" });
    }

    const newRequest = await PoolRequest.create({
      userId,
      userName,
      userPhone,
      pickup,
      destination,
      preferredTime: preferredDate,
      isHost: true,
    });

    res.status(201).json(newRequest);
  } catch (error) {
    console.error("Error creating pool request:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all non-cancelled requests (used by Feed & Admin)
router.get("/requests", async (req, res) => {
  try {
    const { destination } = req.query;
    
    let filter = { status: { $in: ["pending", "grouped"] } };
    if (destination) {
      filter.destination = destination;
    }

    const requests = await PoolRequest.find(filter)
      .sort({ preferredTime: 1 }) // Nearest time first
      .populate('groupId');

    res.json(requests);
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get detailed status of a specific user
router.get("/user/:userId/status", async (req, res) => {
  try {
    // Find all active requests for this user
    const requests = await PoolRequest.find({
      userId: req.params.userId,
      status: { $ne: "cancelled" }
    }).sort({ createdAt: -1 });

    const populatedRequests = [];
    for (let req of requests) {
      let reqObj = req.toObject();
      
      // Fetch incoming JoinRequests (where targetReqId == this request)
      const incomingJoins = await JoinRequest.find({
        targetReqId: req._id,
        status: "pending"
      });
      
      reqObj.incomingJoins = incomingJoins;

      // Fetch outgoing JoinRequests (where joinerReqId == this request - Wait, we removed joinerReqId, now we just check if this user has any JoinRequests pointing anywhere!)
      // Actually outgoingJoin applies to the User globally, not tied to a specific request they own.
      // We will handle that outside the `requests` loop.
      
      if (req.groupId) {
        const group = await RideGroup.findById(req.groupId);
        reqObj.group = group;
        
        // Check for proposals
        if (group && (group.status === "pending_proposal" || group.status === "confirmed")) {
          const proposal = await RideProposal.findOne({ groupId: group._id }).sort({ createdAt: -1 });
          reqObj.proposal = proposal;
        }
      }
      populatedRequests.push(reqObj);
    }

    // Fetch outgoing JoinRequests for this user globally
    const outgoingJoins = await JoinRequest.find({
      userId: req.params.userId,
      status: "pending"
    }).populate('targetReqId');

    res.json({ requests: populatedRequests, outgoingJoins });
  } catch (error) {
    console.error("Error fetching user status:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Send a Join Request
router.post("/join", async (req, res) => {
  try {
    const { targetRequestId, userId, userName, userPhone, pickup, preferredTime } = req.body;
    
    const targetReq = await PoolRequest.findById(targetRequestId);
    if (!targetReq) return res.status(404).json({ error: "Target request not found" });

    // Check if join request exists for this user and target
    const existingJoin = await JoinRequest.findOne({
      userId,
      targetReqId: targetRequestId,
      status: "pending"
    });

    if (existingJoin) {
       return res.status(400).json({ error: "Already requested to join this ride" });
    }

    const proposedTimeDate = new Date(preferredTime);
    if (proposedTimeDate < new Date()) {
      return res.status(400).json({ error: "Proposed time must be in the future" });
    }

    const joinRequest = await JoinRequest.create({
      userId,
      userName,
      userPhone,
      pickup,
      targetReqId: targetRequestId,
      proposedTime: proposedTimeDate
    });

    res.json({ success: true, joinRequest });
  } catch (error) {
    console.error("Error sending join request:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Accept a Join Request
router.post("/join/accept", async (req, res) => {
  try {
    const { joinRequestId, userId } = req.body;
    const joinReq = await JoinRequest.findById(joinRequestId).populate('targetReqId');
    if (!joinReq) return res.status(404).json({ error: "Join request not found" });

    joinReq.status = "accepted";
    await joinReq.save();

    const targetReq = joinReq.targetReqId;

    // Create a shadow PoolRequest for the joiner so they appear grouped
    const joinerReq = await PoolRequest.create({
      userId: joinReq.userId,
      userName: joinReq.userName,
      userPhone: joinReq.userPhone,
      pickup: joinReq.pickup,
      destination: targetReq.destination,
      preferredTime: targetReq.preferredTime, // Inherits host's time
      status: "grouped",
      groupId: targetReq.groupId || null,
      isHost: false, // Joiners are not hosts
    });

    let group;
    if (targetReq.groupId) {
      group = await RideGroup.findById(targetReq.groupId);
      if (group.users.length >= 4) return res.status(400).json({ error: "Group is full" });
      
      group.requests.push(joinerReq._id);
      group.users.push({ userId: joinerReq.userId, userName: joinerReq.userName, userPhone: joinerReq.userPhone });
      await group.save();
    } else {
      targetReq.status = "grouped";
      await targetReq.save();
      
      group = await RideGroup.create({
        destination: targetReq.destination,
        agreedTime: targetReq.preferredTime, 
        requests: [targetReq._id, joinerReq._id],
        users: [
          { userId: targetReq.userId, userName: targetReq.userName, userPhone: targetReq.userPhone },
          { userId: joinerReq.userId, userName: joinerReq.userName, userPhone: joinerReq.userPhone }
        ]
      });
      targetReq.groupId = group._id;
      await targetReq.save();
    }

    joinerReq.groupId = group._id;
    await joinerReq.save();

    res.json({ success: true, group });
  } catch (error) {
    console.error("Error accepting join:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Reject a Join Request
router.post("/join/reject", async (req, res) => {
  try {
    const { joinRequestId } = req.body;
    const joinReq = await JoinRequest.findById(joinRequestId);
    if (!joinReq) return res.status(404).json({ error: "Not found" });
    
    joinReq.status = "rejected";
    await joinReq.save();
    
    res.json({ success: true });
  } catch (err) {
    console.error("Error rejecting join:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Accept a proposal
router.post("/proposal/accept", async (req, res) => {
  try {
    const { proposalId, userId } = req.body;
    const proposal = await RideProposal.findById(proposalId);
    if (!proposal) return res.status(404).json({ error: "Proposal not found" });

    const group = await RideGroup.findById(proposal.groupId);

    if (!proposal.acceptedBy.includes(userId)) {
      proposal.acceptedBy.push(userId);
    }
    
    // Check if everyone accepted
    let fullyAccepted = true;
    for (const u of group.users) {
      if (!proposal.acceptedBy.includes(u.userId)) fullyAccepted = false;
    }

    if (fullyAccepted) {
      proposal.status = "fully_accepted";
      group.status = "confirmed";
      
      await PoolRequest.updateMany(
        { _id: { $in: group.requests } },
        { status: "assigned" }
      );
      
      await group.save();
    }
    
    await proposal.save();

    res.json({ success: true, proposal, group });
  } catch (error) {
    console.error("Error accepting proposal:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete standalone request
router.delete("/request/:id", async (req, res) => {
  try {
    await PoolRequest.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------------------------------------------
// ADMIN / TAXI OWNER ENDPOINTS
// -------------------------------------------------------------

// Manually group students
router.post("/admin/group", async (req, res) => {
  try {
    const { requestIds } = req.body; // Array of PoolRequest IDs
    
    if (!Array.isArray(requestIds) || requestIds.length < 2 || requestIds.length > 4) {
      return res.status(400).json({ error: "Group size must be between 2 and 4" });
    }

    const requests = await PoolRequest.find({ _id: { $in: requestIds } });
    if (requests.length !== requestIds.length) {
      return res.status(404).json({ error: "Some requests not found" });
    }
    
    // Validate time gaps
    const destination = requests[0].destination;
    const times = requests.map(r => r.preferredTime.getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const gapMs = maxTime - minTime;
    
    const isAirport = destination.toLowerCase().includes("airport") || destination.toLowerCase().includes("ccu");
    const maxGapMs = isAirport ? 2 * 60 * 60 * 1000 : 30 * 60 * 1000;
    
    if (gapMs > maxGapMs) {
      const gapMin = Math.round(gapMs / 60000);
      const limitMin = Math.round(maxGapMs / 60000);
      return res.status(400).json({ error: `Time gap too large (${gapMin}m). Max allowed: ${limitMin}m` });
    }

    // Set agreed time to the earliest preferredTime among all requests
    const agreedTime = new Date(minTime);
    
    const users = requests.map(r => ({
      userId: r.userId, 
      userName: r.userName, 
      userPhone: r.userPhone
    }));

    const newGroup = await RideGroup.create({
      destination,
      agreedTime,
      requests: requestIds,
      users
    });

    // Mark all as isHost: true in admin grouping (since they all posted rides)
    await PoolRequest.updateMany(
      { _id: { $in: requestIds } },
      { status: "grouped", groupId: newGroup._id, isHost: true }
    );

    res.json(newGroup);
  } catch (error) {
    console.error("Error admin grouping:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/groups", async (req, res) => {
  try {
    const groups = await RideGroup.find()
      .populate('requests')
      .sort({ createdAt: -1 });
    res.json(groups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Propose a ride
router.post("/admin/propose", async (req, res) => {
  try {
    const { groupId, driverName, driverPhone, ownerPhone, pickupLocation, pickupTime } = req.body;
    
    const group = await RideGroup.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    const proposal = await RideProposal.create({
      groupId,
      driverName,
      driverPhone,
      ownerPhone,
      pickupLocation,
      pickupTime: new Date(pickupTime),
    });

    group.status = "pending_proposal";
    await group.save();

    res.status(201).json(proposal);
  } catch (error) {
    console.error("Error creating proposal:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin ungroup - disbands a group
router.post("/admin/ungroup", async (req, res) => {
  try {
    const { groupId } = req.body;
    const group = await RideGroup.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    // Reset all pool requests
    await PoolRequest.updateMany(
      { groupId: groupId },
      { status: "pending", groupId: null }
    );

    // Delete proposal if any
    await RideProposal.deleteMany({ groupId: groupId });
    
    // Delete the group
    await RideGroup.findByIdAndDelete(groupId);

    res.json({ success: true, message: "Group disbanded" });
  } catch (error) {
    console.error("Ungroup error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Leave group - individual user leaving
router.post("/group/leave", async (req, res) => {
  try {
    const { requestId, userId } = req.body;
    
    const poolReq = await PoolRequest.findById(requestId);
    if (!poolReq) return res.status(404).json({ error: "Request not found" });
    if (poolReq.userId !== userId) return res.status(403).json({ error: "Unauthorized" });
    if (!poolReq.groupId) return res.status(400).json({ error: "Not in a group" });
    
    const groupId = poolReq.groupId;
    const group = await RideGroup.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    // Remove from group
    group.requests = group.requests.filter(id => id.toString() !== requestId);
    group.users = group.users.filter(u => u.userId !== userId);

    // Reset the request
    poolReq.status = "pending";
    poolReq.groupId = null;
    await poolReq.save();

    if (group.users.length < 2) {
      // Disband entirely if only 1 (or 0) left
      for (let rid of group.requests) {
        await PoolRequest.findByIdAndUpdate(rid, { status: "pending", groupId: null });
      }
      await RideProposal.deleteMany({ groupId: groupId });
      await RideGroup.findByIdAndDelete(groupId);
      return res.json({ success: true, disbanded: true });
    } else {
      await group.save();
      // Update agreedTime to new earliest if needed? (Requirement didn't specify, but good for consistency)
      const remainingReqs = await PoolRequest.find({ _id: { $in: group.requests } });
      const minTime = Math.min(...remainingReqs.map(r => r.preferredTime.getTime()));
      group.agreedTime = new Date(minTime);
      await group.save();
      return res.json({ success: true, disbanded: false });
    }
  } catch (error) {
    console.error("Leave group error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
