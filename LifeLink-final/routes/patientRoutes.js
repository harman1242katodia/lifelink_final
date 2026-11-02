/**
 * ==============================================================================
 * LifeLink — Patient Routes
 * ==============================================================================
 * 
 * Endpoints:
 * - POST /api/patient/requests: Submit new emergency donation request to target hospital
 * - GET  /api/patient/requests: Retrieve only the authenticated patient's requests
 * - GET  /api/patient/requests/:id: Retrieve single request (strict ownership check)
 * - GET  /api/patient/profile: Retrieve patient profile
 * - PUT  /api/patient/profile: Update patient profile
 * - GET  /api/patient/smart-match: Location-based hospital and compatible donor matching
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const PatientRequest = require('../models/PatientRequest');
const PatientProfile = require('../models/PatientProfile');
const HospitalProfile = require('../models/HospitalProfile');
const DonorProfile = require('../models/DonorProfile');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { requireDatabase } = require('../config/db');
const { calculateRequestPriority } = require('../middleware/priority');
const { handleProfileUpload, deletePreviousProfilePicture, cleanupNewFile } = require('../middleware/upload');

// All patient endpoints require MongoDB & authentication as 'patient'
router.use(requireDatabase);
router.use(protect);
router.use(authorize('patient'));

/**
 * Haversine formula for calculating approximate distance in kilometers
 * between two geographic coordinate pairs.
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return null;
  }
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10; // Round to 1 decimal place
}

/**
 * Blood group compatibility dictionary: returns array of donor groups compatible with recipient.
 */
function getCompatibleDonorBloodGroups(recipientGroup) {
  if (!recipientGroup) return [];
  const clean = recipientGroup.toUpperCase().trim();
  const matrix = {
    'A+': ['A+', 'A-', 'O+', 'O-'],
    'A-': ['A-', 'O-'],
    'B+': ['B+', 'B-', 'O+', 'O-'],
    'B-': ['B-', 'O-'],
    'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], // Universal recipient
    'AB-': ['AB-', 'A-', 'B-', 'O-'],
    'O+': ['O+', 'O-'],
    'O-': ['O-'] // Universal donor
  };
  return matrix[clean] || [clean];
}

/**
 * @route   POST /api/patient/requests
 * @desc    Create a patient emergency donation request directed to a selected hospital
 * @access  Private (Patient only)
 */
router.post('/requests', async (req, res) => {
  try {
    const {
      hospitalId,
      donationType,
      bloodGroup,
      organRequired,
      requiredUnits,
      urgency,
      location,
      locality,
      description
    } = req.body;

    if (!hospitalId || !donationType || !location || !description) {
      return res.status(400).json({
        success: false,
        message: 'Please provide hospital, donation type, location, and description.'
      });
    }

    // Verify target hospital exists by valid ObjectId in verified registry
    if (!hospitalId || !mongoose.Types.ObjectId.isValid(hospitalId)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid verified hospital facility from the network.'
      });
    }

    let hospital = await HospitalProfile.findOne({
      _id: hospitalId,
      active: { $ne: false },
      isVerified: { $ne: false }
    });

    // Check if target ID was merged into a canonical hospital
    if (!hospital) {
      const mergedCandidate = await HospitalProfile.findById(hospitalId);
      if (mergedCandidate && mergedCandidate.mergedInto) {
        hospital = await HospitalProfile.findOne({
          _id: mergedCandidate.mergedInto,
          active: { $ne: false },
          isVerified: { $ne: false }
        });
      }
    }

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'The selected target hospital was not found in the verified network.'
      });
    }

    // Calculate deterministic rule-based priority
    const priorityCalc = calculateRequestPriority(urgency || 'Normal', new Date());

    const patientReq = await PatientRequest.create({
      patient: req.user._id,
      patientName: req.user.name,
      patientContact: req.user.phone || '',
      hospital: hospital._id,
      hospitalName: hospital.hospitalName,
      donationType: donationType.trim(),
      bloodGroup: bloodGroup ? bloodGroup.trim() : null,
      organRequired: organRequired ? organRequired.trim() : null,
      requiredUnits: Number(requiredUnits) || 1,
      urgency: urgency || 'Normal',
      priority: priorityCalc.priority,
      priorityReason: priorityCalc.reason,
      location: location.trim(),
      locality: locality ? locality.trim() : hospital.locality,
      description: description.trim(),
      status: 'Pending Review'
    });

    // Generate in-app notification for the target hospital
    await Notification.create({
      recipient: hospital.user,
      recipientRole: 'hospital',
      title: 'New Emergency Patient Request Received',
      message: `${req.user.name} submitted a ${donationType} request (Urgency: ${urgency || 'Normal'}). Priority: ${priorityCalc.priority}.`,
      type: 'patient_request',
      relatedId: patientReq._id.toString()
    });

    res.status(201).json({
      success: true,
      message: 'Emergency request created and submitted to hospital review queue.',
      data: patientReq
    });
  } catch (error) {
    console.error('Create patient request error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error creating patient request.'
    });
  }
});

/**
 * @route   GET /api/patient/requests
 * @desc    Retrieve all requests belonging to the authenticated patient
 * @access  Private (Patient only)
 */
router.get('/requests', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { patient: req.user._id };

    if (status && status !== 'all' && status !== 'All') {
      const clean = status.toLowerCase().trim();
      if (clean === 'pending') {
        filter.status = { $in: ['Pending Review', 'Under Review'] };
      } else if (clean === 'accepted' || clean === 'reviewed') {
        filter.status = 'Reviewed — Response Sent';
      } else if (clean === 'completed') {
        filter.status = 'Completed';
      } else {
        filter.status = status;
      }
    }

    const requests = await PatientRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate('hospital', 'hospitalName locality address contact');

    // Aggregate status counters from all patient requests
    const allPatientRequests = await PatientRequest.find({ patient: req.user._id });
    const summary = {
      total: allPatientRequests.length,
      pending: allPatientRequests.filter(r => r.status === 'Pending Review' || r.status === 'Under Review').length,
      reviewed: allPatientRequests.filter(r => r.status === 'Reviewed — Response Sent').length,
      completed: allPatientRequests.filter(r => r.status === 'Completed').length
    };

    res.status(200).json({
      success: true,
      count: requests.length,
      summary,
      data: requests
    });
  } catch (error) {
    console.error('Fetch patient requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to load requests. Please try again.'
    });
  }
});

/**
 * @route   GET /api/patient/requests/:id
 * @desc    Retrieve single request details (enforces ownership)
 * @access  Private (Patient only)
 */
router.get('/requests/:id', async (req, res) => {
  try {
    const patientReq = await PatientRequest.findById(req.params.id)
      .populate('hospital', 'hospitalName locality address contact email');

    if (!patientReq) {
      return res.status(404).json({
        success: false,
        message: 'Request not found.'
      });
    }

    // Ownership check: Patient can access ONLY their own requests
    if (patientReq.patient.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_RECORD',
        message: 'Access denied: You do not have permission to view another patient\'s request.'
      });
    }

    res.status(200).json({
      success: true,
      data: patientReq
    });
  } catch (error) {
    console.error('Get patient request error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to retrieve request details.'
    });
  }
});

/**
 * @route   GET /api/patient/profile
 * @desc    Get current patient profile
 * @access  Private (Patient only)
 */
router.get('/profile', async (req, res) => {
  try {
    let profile = await PatientProfile.findOne({ user: req.user._id });
    if (!profile) {
      profile = await PatientProfile.create({
        user: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone || '',
        isProfileComplete: false
      });
    }

    res.status(200).json({
      success: true,
      data: profile,
      isProfileComplete: Boolean(profile.isProfileComplete)
    });
  } catch (error) {
    console.error('Get patient profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving profile.'
    });
  }
});

/**
 * @route   PUT /api/patient/profile
 * @desc    Update patient profile
 * @access  Private (Patient only)
 */
router.put('/profile', async (req, res) => {
  try {
    let profile = await PatientProfile.findOne({ user: req.user._id });
    if (!profile) {
      profile = new PatientProfile({
        user: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone || '',
        isProfileComplete: false
      });
    }

    const allowedFields = [
      'name', 'phone', 'age', 'gender', 'bloodGroup',
      'address', 'locality', 'city', 'state', 'pincode',
      'emergencyContact', 'medicalCondition', 'organRequirement', 'coordinates'
    ];
    const updateData = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if ((field === 'gender' || field === 'bloodGroup') && !req.body[field]) {
          // Do not write empty strings into enum fields
          return;
        }
        updateData[field] = req.body[field];
      }
    });

    // Ensure email remains strictly bound to authenticated account
    updateData.email = req.user.email;

    // Determine completion status
    const candidateName = updateData.name !== undefined ? updateData.name : profile.name;
    const candidatePhone = updateData.phone !== undefined ? updateData.phone : profile.phone;
    const candidateAge = updateData.age !== undefined ? updateData.age : profile.age;
    const candidateBloodGroup = updateData.bloodGroup !== undefined ? updateData.bloodGroup : profile.bloodGroup;
    const candidateAddress = updateData.address !== undefined ? updateData.address : profile.address;
    const candidateCity = updateData.city !== undefined ? updateData.city : profile.city;
    const candidateEmPhone = (updateData.emergencyContact && updateData.emergencyContact.phone) ||
      (profile.emergencyContact && profile.emergencyContact.phone);

    const isComplete = Boolean(
      candidateName &&
      candidatePhone &&
      candidateAge &&
      candidateBloodGroup &&
      candidateAddress &&
      candidateCity &&
      candidateEmPhone
    );

    updateData.isProfileComplete = isComplete;

    const updatedProfile = await PatientProfile.findOneAndUpdate(
      { user: req.user._id },
      { $set: updateData },
      { returnDocument: 'after', upsert: true, runValidators: true }
    );

    // Also update user name/phone if modified
    if (updateData.name || updateData.phone) {
      await User.findByIdAndUpdate(req.user._id, {
        name: updateData.name || req.user.name,
        phone: updateData.phone || req.user.phone
      });
    }

    res.status(200).json({
      success: true,
      message: isComplete
        ? 'Patient profile successfully completed and saved.'
        : 'Patient profile updated.',
      data: updatedProfile,
      isProfileComplete: Boolean(updatedProfile.isProfileComplete)
    });
  } catch (error) {
    console.error('Update patient profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating profile.'
    });
  }
});

/**
 * @route   POST /api/patient/profile/picture
 * @desc    Upload or update patient profile picture (JPG, PNG, WEBP <= 2MB)
 * @access  Private (Patient only)
 */
const uploadPatientPhoto = async (req, res) => {
  try {
    let profile = await PatientProfile.findOne({ user: req.user._id });
    if (!profile) {
      profile = new PatientProfile({
        user: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone || '',
        isProfileComplete: false
      });
    }

    const oldPicture = profile.profilePicture;
    const newPicturePath = `/uploads/profiles/${req.file.filename}`;
    profile.profilePicture = newPicturePath;

    try {
      await profile.save();

      // Safely delete previous profile picture if replaced
      if (oldPicture && oldPicture !== newPicturePath) {
        deletePreviousProfilePicture(oldPicture);
      }

      return res.status(200).json({
        success: true,
        message: 'Profile picture uploaded and updated successfully.',
        profilePicture: newPicturePath,
        data: profile
      });
    } catch (saveError) {
      // Clean up newly uploaded file if DB save fails
      cleanupNewFile(req.file.path);
      throw saveError;
    }
  } catch (error) {
    console.error('Patient profile picture upload error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error saving profile picture.'
    });
  }
};

router.post('/profile/picture', handleProfileUpload, uploadPatientPhoto);
router.post('/profile-picture', handleProfileUpload, uploadPatientPhoto);

/**
 * @route   GET /api/patient/smart-match
 * @desc    Location-Based Smart Donor Match
 *          Finds hospitals in or near patient's locality and compatible potential donors.
 *          Ranks results by proximity using verified coordinates when available.
 * @access  Private (Patient only)
 */
router.get('/smart-match', async (req, res) => {
  try {
    const { locality, bloodGroup, units, urgency } = req.query;

    if (!locality || !bloodGroup) {
      return res.status(400).json({
        success: false,
        message: 'Please provide patient locality and blood group to perform Smart Donor Match.'
      });
    }

    const cleanLocality = locality.trim().toLowerCase();
    const cleanBloodGroup = bloodGroup.trim().toUpperCase();
    const requiredUnits = Number(units) || 1;
    const compatibleGroups = getCompatibleDonorBloodGroups(cleanBloodGroup);

    // Retrieve patient profile coordinates if available
    const patientProf = await PatientProfile.findOne({ user: req.user._id });
    const pLat = patientProf && patientProf.coordinates ? patientProf.coordinates.lat : null;
    const pLng = patientProf && patientProf.coordinates ? patientProf.coordinates.lng : null;

    // Fetch verified hospitals from MongoDB
    const hospitals = await HospitalProfile.find({ active: true }).lean();
    if (!hospitals || hospitals.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No nearby matching hospitals found in the database.',
        data: []
      });
    }

    // Retrieve active donors matching compatible blood groups
    const compatibleDonors = await DonorProfile.find({
      donationType: 'Blood',
      bloodGroup: { $in: compatibleGroups },
      availability: 'Available'
    }).select('name bloodGroup city locality associatedHospital associatedHospitalName availability').lean();

    // Group matching donors under their associated hospitals
    const results = [];

    for (const hosp of hospitals) {
      // Find donors associated with this hospital
      const associatedDonors = compatibleDonors.filter(d => 
        (d.associatedHospital && d.associatedHospital.toString() === hosp._id.toString()) ||
        (d.associatedHospitalName && d.associatedHospitalName.toLowerCase() === hosp.hospitalName.toLowerCase())
      );

      // Check if hospital is in same locality or nearby
      const hospLocality = (hosp.locality || '').toLowerCase();
      const hospCity = (hosp.city || '').toLowerCase();
      const isLocalityMatch = hospLocality.includes(cleanLocality) || cleanLocality.includes(hospLocality);

      // Calculate approximate distance if coordinates exist
      let distanceKm = null;
      if (pLat && pLng && hosp.coordinates && hosp.coordinates.lat && hosp.coordinates.lng) {
        distanceKm = calculateDistanceKm(pLat, pLng, hosp.coordinates.lat, hosp.coordinates.lng);
      }

      // Check hospital available blood stock for the requested group
      const stockEntry = (hosp.availableBloodStock || []).find(s => s.bloodGroup === cleanBloodGroup);
      const stockUnits = stockEntry ? stockEntry.units : 0;

      // Include in results if either locality matches or hospital is within reasonable proximity
      results.push({
        hospitalId: hosp._id,
        hospitalName: hosp.hospitalName,
        locality: hosp.locality,
        city: hosp.city,
        address: hosp.address,
        contact: hosp.contact,
        approximateDistanceKm: distanceKm,
        distanceLabel: distanceKm !== null ? `~${distanceKm} km (Approximate)` : 'Proximity based on locality',
        isLocalityMatch,
        reportedBloodStock: {
          bloodGroup: cleanBloodGroup,
          availableUnits: stockUnits,
          note: 'Reported inventory, subject to clinical verification.'
        },
        matchingDonorsCount: associatedDonors.length,
        matchingDonors: associatedDonors.map(d => ({
          donorId: d._id,
          name: d.name,
          bloodGroup: d.bloodGroup,
          locality: d.locality || d.city,
          availability: d.availability
        })),
        matchingCriteria: {
          requestedBloodGroup: cleanBloodGroup,
          compatibleDonorGroups: compatibleGroups,
          urgencyTier: urgency || 'Normal',
          requestedUnits: requiredUnits
        }
      });
    }

    // Rank results:
    // 1. Exact locality matches first
    // 2. Nearest approximate distance (if coordinates calculable)
    // 3. Highest number of associated matching donors
    results.sort((a, b) => {
      if (a.isLocalityMatch && !b.isLocalityMatch) return -1;
      if (!a.isLocalityMatch && b.isLocalityMatch) return 1;

      if (a.approximateDistanceKm !== null && b.approximateDistanceKm !== null) {
        return a.approximateDistanceKm - b.approximateDistanceKm;
      }
      return b.matchingDonorsCount - a.matchingDonorsCount;
    });

    res.status(200).json({
      success: true,
      count: results.length,
      patientLocality: locality,
      requestedBloodGroup: cleanBloodGroup,
      compatibleGroups,
      data: results
    });
  } catch (error) {
    console.error('Smart match error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to load matches. Please try again.'
    });
  }
});

/**
 * @route   GET /api/patient/hospitals
 * @desc    Get list of verified hospitals for patient request selection
 * @access  Private (Patient only)
 */
router.get('/hospitals', async (req, res) => {
  try {
    const rawHospitals = await HospitalProfile.find({
      active: { $ne: false },
      isVerified: { $ne: false }
    })
      .select('hospitalName locality city address contact coordinates availableBloodStock')
      .sort({ hospitalName: 1 });

    // Deduplicate by normalized hospital name to prevent multiple entries (e.g. Fortis or PGI variants)
    const seenNames = new Set();
    const hospitals = [];

    for (const h of rawHospitals) {
      const normName = (h.hospitalName || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!seenNames.has(normName)) {
        seenNames.add(normName);
        hospitals.push({
          _id: h._id,
          hospitalName: h.hospitalName,
          locality: h.locality || '',
          city: h.city || '',
          address: h.address || '',
          contact: h.contact || '',
          coordinates: h.coordinates,
          displayName: `${h.hospitalName} — ${h.locality ? h.locality + ', ' : ''}${h.city || 'Punjab'}`,
          availableBloodStock: h.availableBloodStock || []
        });
      }
    }

    res.status(200).json({
      success: true,
      count: hospitals.length,
      data: hospitals
    });
  } catch (error) {
    console.error('Fetch hospitals error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving hospitals list.'
    });
  }
});

module.exports = router;
