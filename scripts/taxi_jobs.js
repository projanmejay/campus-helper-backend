const cron = require('node-cron');
const mongoose = require('mongoose');

const RideRequest = require('../models/RideRequest');
const RideGroup = require('../models/RideGroup');
const TaxiSetting = require('../models/TaxiSetting');

// Helper to calculate hours difference
const getHoursDiff = (date1, date2) => {
  return Math.abs(date1 - date2) / 36e5;
};

// Helper to parse date/time to Date object
const parseRideDateTime = (dateStr, timeStr) => {
  return new Date(`${dateStr}T${timeStr}:00`);
};

const runRideGroupingEngine = async () => {
  console.log('[Taxi Jobs] Running Ride Grouping Engine...');
  try {
    let settings = await TaxiSetting.findOne();
    if (!settings) return;

    // Get all pending requests
    const pendingRequests = await RideRequest.find({ status: 'PENDING_GROUPING' }).sort({ rideDate: 1, rideTime: 1 });

    if (pendingRequests.length === 0) return;

    // We'll process them one by one and try to group them
    let processedIds = new Set();

    for (let i = 0; i < pendingRequests.length; i++) {
      const req = pendingRequests[i];
      if (processedIds.has(req._id.toString())) continue;

      const reqDate = parseRideDateTime(req.rideDate, req.rideTime);
      
      // Find matching requests for this base request
      let groupMembers = [req];
      processedIds.add(req._id.toString());
      let currentPassengerCount = req.passengerCount;

      for (let j = i + 1; j < pendingRequests.length; j++) {
        const potentialMatch = pendingRequests[j];
        if (processedIds.has(potentialMatch._id.toString())) continue;

        // Check if destination is same (simplified grouping: same destination)
        if (req.destination !== potentialMatch.destination) continue;

        const matchDate = parseRideDateTime(potentialMatch.rideDate, potentialMatch.rideTime);
        const hoursDiff = getHoursDiff(reqDate, matchDate);

        if (hoursDiff <= settings.timeWindowHours) {
          if (currentPassengerCount + potentialMatch.passengerCount <= settings.maxPassengers) {
            groupMembers.push(potentialMatch);
            processedIds.add(potentialMatch._id.toString());
            currentPassengerCount += potentialMatch.passengerCount;
          }
        }
      }

      // If we have at least minPassengers, or if we just decide to group them anyway
      // For now, let's create a group if it meets the criteria or if it's close to the confirmation date.
      // We will create the RideGroup
      if (groupMembers.length > 0) {
        // Calculate fares (initial estimate)
        // Fixed fare is divided among total passengers
        const totalFare = settings.fixedTaxiFare;
        const farePerPassenger = totalFare / currentPassengerCount;

        const passengersList = groupMembers.map(m => ({
          userId: m.userId,
          requestId: m._id,
          passengerCount: m.passengerCount,
          contactNumber: m.contactNumber,
          bookingAmountPaid: m.bookingAmountPaid,
          status: 'AWAITING_FINAL_PAYMENT'
        }));

        const newGroup = await RideGroup.create({
          rideDate: req.rideDate,
          rideTime: req.rideTime, // Use base request time
          pickupArea: req.pickup, // Aggregated pickup
          destination: req.destination,
          passengers: passengersList,
          finalPassengerCount: currentPassengerCount,
          totalTaxiFare: totalFare,
          farePerPassenger: farePerPassenger,
          status: 'UPCOMING' // Stays upcoming for taxi owner
        });

        // Update requests
        for (let m of groupMembers) {
          await RideRequest.findByIdAndUpdate(m._id, {
            status: 'AWAITING_FINAL_PAYMENT',
            groupId: newGroup._id
          });
          // Note: In real app, we'd trigger a Notification here
          console.log(`[Taxi Jobs] Grouped Request ${m._id} into Group ${newGroup._id}`);
        }
      }
    }
  } catch (err) {
    console.error('[Taxi Jobs] Grouping Engine Error:', err);
  }
};

const runFareFinalizationAndCancellation = async () => {
  console.log('[Taxi Jobs] Running Fare Finalization & Cancellation Handler...');
  try {
    let settings = await TaxiSetting.findOne();
    if (!settings) return;

    // Find all groups that are UPCOMING
    const groups = await RideGroup.find({ status: 'UPCOMING' }).populate('passengers.requestId');

    const now = new Date();

    for (let group of groups) {
      const rideDate = parseRideDateTime(group.rideDate, group.rideTime);
      const daysUntilRide = (rideDate - now) / (1000 * 60 * 60 * 24);

      // If we are past the confirmation days deadline, finalize and remove unpaid
      if (daysUntilRide <= settings.confirmationDays) {
        
        // Remove unpaid passengers
        let activePassengers = [];
        let droppedPassengers = [];
        let newPassengerCount = 0;

        for (let p of group.passengers) {
          if (p.status === 'CONFIRMED') {
            activePassengers.push(p);
            newPassengerCount += p.passengerCount;
          } else if (p.status === 'AWAITING_FINAL_PAYMENT') {
            // Check if deadline passed
            // For simplicity, if we hit the confirmation days barrier and they haven't paid, cancel them.
            droppedPassengers.push(p);
          } else {
            activePassengers.push(p);
            if (p.status !== 'CANCELLED') {
               newPassengerCount += p.passengerCount;
            }
          }
        }

        // Cancel dropped requests
        for (let dp of droppedPassengers) {
          await RideRequest.findByIdAndUpdate(dp.requestId._id || dp.requestId, { status: 'CANCELLED' });
          console.log(`[Taxi Jobs] Cancelled unpaid Request ${dp.requestId._id || dp.requestId}`);
        }

        if (droppedPassengers.length > 0) {
          // Recalculate fares
          const totalFare = settings.fixedTaxiFare;
          // Avoid division by zero
          const farePerPassenger = newPassengerCount > 0 ? totalFare / newPassengerCount : 0;

          group.passengers = activePassengers;
          group.finalPassengerCount = newPassengerCount;
          group.farePerPassenger = farePerPassenger;

          if (newPassengerCount === 0) {
            group.status = 'CANCELLED';
          }

          await group.save();
          console.log(`[Taxi Jobs] Recalculated fare for Group ${group._id}. New per-person fare: ${farePerPassenger}`);
          // Note: Trigger notification to active passengers about new fare
        }
      }
    }
  } catch (err) {
    console.error('[Taxi Jobs] Finalization Error:', err);
  }
};

const initTaxiJobs = () => {
  console.log('[Taxi Jobs] Initializing scheduled jobs...');
  
  // Run grouping engine every 15 minutes
  cron.schedule('*/15 * * * *', runRideGroupingEngine);

  // Run finalization and cancellation every hour
  cron.schedule('0 * * * *', runFareFinalizationAndCancellation);
};

module.exports = { initTaxiJobs };
