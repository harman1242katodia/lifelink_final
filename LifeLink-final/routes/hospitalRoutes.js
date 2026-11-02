/**
 * ==============================================================================
 * LifeLink — Hospital Routes
 * ==============================================================================
 * 
 * Provides endpoints for accredited hospital facilities:
 * 1. GET  /api/hospital/profile: Retrieve hospital's own profile and inventory
 * 2. PUT  /api/hospital/profile: Update hospital details and blood stock
 * 3. GET  /api/hospital/requests: Retrieve patient requests directed to this hospital
 * 4. GET  /api/hospital/requests/:id: Retrieve single patient request details
 * 5. POST /api/hospital/requests/:id/respond: Clinical review & response workflow
 * 6. GET  /api/hospital/applications: Retrieve volunteer donor applications
 * 7. GET  /api/hospital/applications/:id: Retrieve single donor application
 * 8. POST /api/hospital/applications/:id/decision: Donor application decision workflow
 * 9. GET  /api/hospital/donors: View verified donors associated with this hospital
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const HospitalProfile = require('../models/HospitalProfile');
const PatientRequest = require('../models/PatientRequest');
const DonorApplication = require('../models/DonorApplication');
const DonorProfile = require('../models/DonorProfile');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { requireDatabase } = require('../config/db');
const { calculateRequestPriority } = require('../middleware/priority');

// All hospital routes require MongoDB, authentication, and hospital role
router.use(requireDatabase);
router.use(protect);
router.use(authorize('hospital'));

/**
 * Helper: Find HospitalProfile associated with authenticated user
 * Resolves canonical profile if user was merged
 */
async function getAuthenticatedHospital(userId) {
  let hospital = await HospitalProfile.findOne({ user: userId });
  if (hospital && !hospital.active && hospital.mergedInto) {
    const canonical = await HospitalProfile.findOne({ _id: hospital.mergedInto, active: true });
    if (canonical) return canonical;
  }
  return hospital;
}

/**
 * Helper: Retrieve all facility IDs (canonical + any merged duplicate IDs + user ID)
 */
async function getHospitalFacilityIds(hospitalId) {
  const targetId = (hospitalId && hospitalId._id) ? hospitalId._id : hospitalId;
  const merged = await HospitalProfile.find({ mergedInto: targetId }).distinct('_id');
  const ids = [targetId, ...merged];
  try {
    const profile = await HospitalProfile.findById(targetId);
    if (profile && profile.user) {
      ids.push(profile.user);
    }
  } catch (e) {
    // ignore
  }
  return ids;
}

/**
 * @route   GET /api/hospital/profile
 * @desc    Get authenticated hospital's profile and blood stock
 * @access  Private (Hospital only)
 */
router.get('/profile', async (req, res) => {
  try {
    const hospital = await getAuthenticatedHospital(req.user._id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital profile not found for this user account.'
      });
    }

    res.status(200).json({
      success: true,
      data: hospital
    });
  } catch (error) {
    console.error('Get hospital profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving hospital profile.'
    });
  }
});

/**
 * @route   PUT /api/hospital/profile
 * @desc    Update authenticated hospital profile or blood stock
 * @access  Private (Hospital only)
 */
router.put('/profile', async (req, res) => {
  try {
    const hospital = await getAuthenticatedHospital(req.user._id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital profile not found.'
      });
    }

    const {
      hospitalName,
      address,
      locality,
      city,
      state,
      pincode,
      contact,
      availableBloodStock,
      coordinates
    } = req.body;

    if (hospitalName) hospital.hospitalName = hospitalName.trim();
    if (address) hospital.address = address.trim();
    if (locality) hospital.locality = locality.trim();
    if (city) hospital.city = city.trim();
    if (state) hospital.state = state.trim();
    if (pincode) hospital.pincode = pincode.trim();
    if (contact) hospital.contact = contact.trim();
    if (coordinates && coordinates.lat !== undefined && coordinates.lng !== undefined) {
      hospital.coordinates = {
        lat: Number(coordinates.lat),
        lng: Number(coordinates.lng)
      };
    }
    if (Array.isArray(availableBloodStock)) {
      hospital.availableBloodStock = availableBloodStock;
    }

    await hospital.save();

    res.status(200).json({
      success: true,
      message: 'Hospital profile updated successfully.',
      data: hospital
    });
  } catch (error) {
    console.error('Update hospital profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating hospital profile.'
    });
  }
});

/**
 * @route   GET /api/hospital/requests
 * @desc    Retrieve patient emergency requests directed to this hospital
 * @access  Private (Hospital only)
 */
router.get('/requests', async (req, res) => {
  try {
    const hospital = await getAuthenticatedHospital(req.user._id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital record not found.'
      });
    }

    const { status, urgency } = req.query;
    const facilityIds = await getHospitalFacilityIds(hospital._id);
    const filter = { hospital: { $in: facilityIds } };

    if (status && status !== 'All' && status !== 'all') {
      filter.status = status;
    }
    if (urgency && urgency !== 'All' && urgency !== 'all') {
      filter.urgency = urgency;
    }

    const requests = await PatientRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate('patient', 'name email phone');

    // Dynamically refresh deterministic triage priority based on waiting duration
    const evaluatedRequests = requests.map(item => {
      const doc = item.toObject();
      const currentPriority = calculateRequestPriority(doc.urgency, doc.createdAt);
      doc.priority = currentPriority.priority;
      doc.priorityReason = currentPriority.reason;
      doc.hoursWaiting = currentPriority.hoursWaiting;
      return doc;
    });

    res.status(200).json({
      success: true,
      count: evaluatedRequests.length,
      hospitalName: hospital.hospitalName,
      data: evaluatedRequests
    });
  } catch (error) {
    console.error('Fetch hospital requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving hospital requests.'
    });
  }
});

/**
 * @route   GET /api/hospital/requests/:id
 * @desc    Retrieve single patient request assigned to this hospital
 * @access  Private (Hospital only)
 */
router.get('/requests/:id', async (req, res) => {
  try {
    const hospital = await getAuthenticatedHospital(req.user._id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital record not found.'
      });
    }

    const patientReq = await PatientRequest.findById(req.params.id)
      .populate('patient', 'name email phone');

    if (!patientReq) {
      return res.status(404).json({
        success: false,
        message: 'Patient request not found.'
      });
    }

    // Ownership check: Must be assigned to this hospital
    const facilityIds = (await getHospitalFacilityIds(hospital._id)).map(id => id.toString());
    if (!facilityIds.includes(patientReq.hospital.toString())) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_RECORD',
        message: 'Access denied: This request was not directed to your medical facility.'
      });
    }

    const priorityInfo = calculateRequestPriority(patientReq.urgency, patientReq.createdAt);

    res.status(200).json({
      success: true,
      data: {
        ...patientReq.toObject(),
        priority: priorityInfo.priority,
        priorityReason: priorityInfo.reason,
        hoursWaiting: priorityInfo.hoursWaiting
      }
    });
  } catch (error) {
    console.error('Fetch hospital single request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving request details.'
    });
  }
});

/**
 * @route   POST /api/hospital/requests/:id/respond
 * @desc    Submit clinical review response and update patient request status
 * @access  Private (Hospital only)
 */
router.post('/requests/:id/respond', async (req, res) => {
  try {
    const hospital = await getAuthenticatedHospital(req.user._id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital record not found.'
      });
    }

    const { status, message, reason, actualCompletionConfirmed } = req.body;

    const allowedStatuses = [
      'Under Review',
      'Reviewed — Response Sent',
      'More Information Required',
      'Unable to Proceed — Explanation Sent',
      'Completed'
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: [${allowedStatuses.join(', ')}].`
      });
    }

    if (!message || message.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'A meaningful clinical response message (minimum 5 characters) is required.'
      });
    }

    // Explanation strictly required when hospital cannot proceed
    if (status === 'Unable to Proceed — Explanation Sent' && (!reason && !message)) {
      return res.status(400).json({
        success: false,
        message: 'A clear clinical explanation is required when a request cannot proceed.'
      });
    }

    // Completion verification requirement
    if (status === 'Completed' && actualCompletionConfirmed !== true) {
      return res.status(400).json({
        success: false,
        message: 'Confirmation of actual medical fulfillment or donation completion is required to mark as Completed.'
      });
    }

    const patientReq = await PatientRequest.findById(req.params.id);
    if (!patientReq) {
      return res.status(404).json({
        success: false,
        message: 'Patient request not found.'
      });
    }

    // Verify hospital authorization
    const facilityIds = (await getHospitalFacilityIds(hospital._id)).map(id => id.toString());
    if (!facilityIds.includes(patientReq.hospital.toString())) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_RECORD',
        message: 'Access denied: You cannot respond to requests directed to another facility.'
      });
    }

    const responseText = reason ? `${message.trim()} (Reason: ${reason.trim()})` : message.trim();

    // Append response audit trail
    patientReq.responses.push({
      senderUser: req.user._id,
      senderName: req.user.name,
      hospitalName: hospital.hospitalName,
      message: responseText,
      statusAtResponse: status,
      timestamp: new Date()
    });

    patientReq.status = status;
    await patientReq.save();

    // Create in-app notification for the patient
    await Notification.create({
      recipient: patientReq.patient,
      recipientRole: 'patient',
      title: `Hospital Update: ${status}`,
      message: `${hospital.hospitalName}: "${responseText}"`,
      type: 'patient_request',
      relatedId: patientReq._id.toString()
    });

    res.status(200).json({
      success: true,
      message: `Clinical response submitted and request status updated to "${status}".`,
      data: patientReq
    });
  } catch (error) {
    console.error('Submit hospital response error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error submitting response.'
    });
  }
});

/**
 * @route   GET /api/hospital/applications
 * @desc    Retrieve volunteer donor applications directed to this hospital
 * @access  Private (Hospital only)
 */
router.get('/applications', async (req, res) => {
  try {
    const hospital = await getAuthenticatedHospital(req.user._id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital record not found.'
      });
    }

    const { status, category } = req.query;
    const facilityIds = await getHospitalFacilityIds(hospital._id);
    const filter = { hospital: { $in: facilityIds } };

    if (status && status !== 'All' && status !== 'all') {
      filter.status = status;
    }
    if (category && category !== 'All' && category !== 'all') {
      filter.donationCategory = category;
    }

    const applications = await DonorApplication.find(filter)
      .sort({ createdAt: -1 })
      .populate('donor', 'name email phone');

    res.status(200).json({
      success: true,
      count: applications.length,
      hospitalName: hospital.hospitalName,
      data: applications
    });
  } catch (error) {
    console.error('Fetch hospital donor applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving donor applications.'
    });
  }
});

/**
 * @route   GET /api/hospital/applications/:id
 * @desc    Retrieve single volunteer donor application assigned to this hospital
 * @access  Private (Hospital only)
 */
router.get('/applications/:id', async (req, res) => {
  try {
    const hospital = await getAuthenticatedHospital(req.user._id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital record not found.'
      });
    }

    const application = await DonorApplication.findById(req.params.id)
      .populate('donor', 'name email phone');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Donor application not found.'
      });
    }

    // Ownership check
    const facilityIds = (await getHospitalFacilityIds(hospital._id)).map(id => id.toString());
    if (!facilityIds.includes(application.hospital.toString())) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_RECORD',
        message: 'Access denied: This donor application belongs to another hospital facility.'
      });
    }

    res.status(200).json({
      success: true,
      data: application
    });
  } catch (error) {
    console.error('Fetch single donor application error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving donor application.'
    });
  }
});

/**
 * @route   POST /api/hospital/applications/:id/decision
 * @desc    Submit decision on volunteer donor application (Accept, Reject, More Info, etc.)
 * @access  Private (Hospital only)
 */
router.post('/applications/:id/decision', async (req, res) => {
  try {
    const hospital = await getAuthenticatedHospital(req.user._id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital record not found.'
      });
    }

    const { decision, explanation, instructions } = req.body;

    const allowedDecisions = [
      'Under Review',
      'Accepted',
      'Rejected',
      'More Information Required'
    ];

    if (!decision || !allowedDecisions.includes(decision)) {
      return res.status(400).json({
        success: false,
        message: `Decision must be one of: [${allowedDecisions.join(', ')}].`
      });
    }

    if (decision === 'Rejected' && (!explanation || explanation.trim().length < 5)) {
      return res.status(400).json({
        success: false,
        message: 'A clinical explanation is required when declining a donor application.'
      });
    }

    const application = await DonorApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Donor application not found.'
      });
    }

    const facilityIds = (await getHospitalFacilityIds(hospital._id)).map(id => id.toString());
    if (!facilityIds.includes(application.hospital.toString())) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_RECORD',
        message: 'Access denied: You cannot make decisions on applications assigned to another hospital.'
      });
    }

    application.status = decision;
    application.hospitalDecision = {
      decision,
      explanation: explanation ? explanation.trim() : '',
      instructions: instructions ? instructions.trim() : '',
      decidedBy: req.user._id,
      decidedAt: new Date()
    };

    await application.save();

    // Create in-app notification for the donor
    await Notification.create({
      recipient: application.donor,
      recipientRole: 'donor',
      title: `Donor Application Status: ${decision}`,
      message: `${hospital.hospitalName} marked your donation pledge as "${decision}". ${explanation || ''}`,
      type: 'donor_application',
      relatedId: application._id.toString()
    });

    res.status(200).json({
      success: true,
      message: `Donor application marked as "${decision}".`,
      data: application
    });
  } catch (error) {
    console.error('Donor application decision error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error saving decision.'
    });
  }
});

/**
 * @route   GET /api/hospital/donors
 * @desc    View verified donors associated with this hospital
 * @access  Private (Hospital only)
 */
router.get('/donors', async (req, res) => {
  try {
    const hospital = await getAuthenticatedHospital(req.user._id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital record not found.'
      });
    }

    const facilityIds = await getHospitalFacilityIds(hospital._id);
    const donors = await DonorProfile.find({
      $or: [
        { associatedHospital: { $in: facilityIds } },
        { associatedHospitalName: hospital.hospitalName }
      ]
    }).select('name age gender bloodGroup contact email locality city availability lastDonationDate');

    res.status(200).json({
      success: true,
      count: donors.length,
      data: donors
    });
  } catch (error) {
    console.error('Fetch hospital donors error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving associated donors.'
    });
  }
});

module.exports = router;
