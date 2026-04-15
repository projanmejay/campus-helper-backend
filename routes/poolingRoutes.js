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
    
    if (!userId || !pickup || !destination || !preferredTime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newRequest = await PoolRequest.create({
      userId,
      userName,
      userPhone,
      pickup,
      destination,
      preferredTime: new Date(preferredTime),
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

    const joinRequest = await JoinRequest.create({
      userId,
      userName,
      userPhone,
      pickup,
      targetReqId: targetRequestId,
      proposedTime: new Date(preferredTime)
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

    // Create a PoolRequest for the joiner NOW that they are accepted
    const joinerReq = await PoolRequest.create({
      userId: joinReq.userId, 
      userName: joinReq.userName, 
      userPhone: joinReq.userPhone, 
      pickup: joinReq.pickup,
      destination: targetReq.destination,
      preferredTime: targetReq.preferredTime, // Inherit base time or use proposed
      status: "grouped"
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
      return res.status(400).json({ error: "Need 2-4 requests to form a group" });
    }

    const requests = await PoolRequest.find({ _id: { $in: requestIds } });
    if (requests.length !== requestIds.length) {
      return res.status(404).json({ error: "Some requests not found" });
    }
    
    const destination = requests[0].destination;
    // Earliest time
    let agreedTime = requests[0].preferredTime;
    
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

    await PoolRequest.updateMany(
      { _id: { $in: requestIds } },
      { status: "grouped", groupId: newGroup._id }
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

module.exports = router;
