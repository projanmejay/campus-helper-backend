const express = require("express");
const router = express.Router();
const PoolingRequest = require("../models/PoolingRequest");
const PoolingGroup = require("../models/PoolingGroup");
const PoolingProposal = require("../models/PoolingProposal");

// 1. Student: Create a new ride post
router.post("/request", async (req, res) => {
  try {
    const newRequest = new PoolingRequest(req.body);
    await newRequest.save();
    res.status(201).json(newRequest);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Student: Get ride feed sorted by time (nearest first)
router.get("/feed", async (req, res) => {
  try {
    const { destination } = req.query;
    const query = { status: "PENDING" };
    if (destination) query.destination = destination;

    const feeds = await PoolingRequest.find(query).sort({ dateTime: 1 });
    res.json(feeds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Student: Request to join an existing ride
router.post("/join", async (req, res) => {
  try {
    const { requestId, userId, userName, userPhone } = req.body;
    const request = await PoolingRequest.findById(requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });

    // Check if user already in joinRequests
    const exists = request.joinRequests.find(r => r.userId === userId);
    if (!exists) {
      request.joinRequests.push({ userId, userName, userPhone, status: "PENDING" });
      request.status = "JOIN_REQUESTED";
      await request.save();
    }

    res.json(request);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Student: Accept a joiner (Original Poster only)
router.post("/accept-joiner", async (req, res) => {
  try {
    const { requestId, joinerUserId } = req.body;
    const request = await PoolingRequest.findById(requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });

    // Mark joiner as accepted
    const joiner = request.joinRequests.find(r => r.userId === joinerUserId);
    if (joiner) joiner.status = "ACCEPTED";

    // Create or update common group
    let group;
    if (request.groupId) {
      group = await PoolingGroup.findById(request.groupId);
    } else {
      group = new PoolingGroup({
        destination: request.destination,
        scheduledTime: request.dateTime,
        members: [{ 
          userId: request.userId, 
          userName: request.userName, 
          userPhone: request.userPhone,
          requestId: request._id 
        }]
      });
    }

    // Add joiner to group members
    group.members.push({ 
      userId: joiner.userId, 
      userName: joiner.userName, 
      userPhone: joiner.userPhone,
      requestId: request._id // In this case we use same requestId for tracking
    });

    await group.save();
    request.groupId = group._id;
    request.status = "GROUPED";
    await request.save();

    res.json({ request, group });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. General: Get My Active Rides / Groups
router.get("/my-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    // Find requests I created or joined
    const requests = await PoolingRequest.find({ userId }).populate("groupId");
    const groups = await PoolingGroup.find({ "members.userId": userId }).populate("proposalId");
    
    res.json({ requests, groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Owner Dashboard: View all groups and individual requests needing cabs
router.get("/owner/dashboard", async (req, res) => {
  try {
    // Show groups WAITING_FOR_CAB or CAB_PROPOSED
    const groups = await PoolingGroup.find({ status: { $ne: "CONFIRMED" } }).sort({ scheduledTime: 1 });
    
    // Also show individual requests that haven't been grouped yet
    const requests = await PoolingRequest.find({ status: "PENDING" }).sort({ dateTime: 1 });

    res.json({ groups, requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Owner: Create a proposal for a group
router.post("/owner/proposal", async (req, res) => {
  try {
    const { groupId, driverName, driverPhone, cabNumber } = req.body;
    const proposal = new PoolingProposal({ groupId, driverName, driverPhone, cabNumber });
    await proposal.save();

    const group = await PoolingGroup.findById(groupId);
    group.proposalId = proposal._id;
    group.status = "CAB_PROPOSED";
    await group.save();

    res.status(201).json(proposal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Student: Accept a proposal
router.post("/accept-proposal", async (req, res) => {
  try {
    const { proposalId, userId } = req.body;
    const proposal = await PoolingProposal.findById(proposalId);
    if (!proposal) return res.status(404).json({ error: "Proposal not found" });

    if (!proposal.acceptedBy.includes(userId)) {
      proposal.acceptedBy.push(userId);
    }

    const group = await PoolingGroup.findById(proposal.groupId);
    
    // Check if ALL members have accepted
    const allAccepted = group.members.every(m => proposal.acceptedBy.includes(m.userId));
    if (allAccepted) {
      proposal.status = "ACCEPTED";
      group.status = "CONFIRMED";
      await group.save();
    }
    
    await proposal.save();
    res.json({ proposal, group });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Student: Delete a ride request
router.delete("/request/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const request = await PoolingRequest.findById(id);
    if (!request) return res.status(404).json({ error: "Request not found" });

    // Handle group cleanup if request is part of a group
    if (request.groupId) {
      const group = await PoolingGroup.findById(request.groupId);
      if (group) {
        // Remove this user from members
        group.members = group.members.filter(m => m.userId !== request.userId);
        
        if (group.members.length === 0) {
          await PoolingGroup.findByIdAndDelete(group._id);
          // Also delete any proposal for this group
          if (group.proposalId) {
            await PoolingProposal.findByIdAndDelete(group.proposalId);
          }
        } else {
          await group.save();
        }
      }
    }

    await PoolingRequest.findByIdAndDelete(id);
    res.json({ success: true, message: "Request deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
