/**
 * ==============================================================================
 * LifeLink — Donor Routes
 * ==============================================================================
 * 
 * Provides endpoints for volunteer donors:
 * 1. GET  /api/donor/profile: Retrieve donor's own profile
 * 2. PUT  /api/donor/profile: Update permitted profile fields
 * 3. POST /api/donor/applications: Submit a donor application to a hospital
 * 4. GET  /api/donor/applications: Retrieve all applications submitted by donor
 * 5. GET  /api/donor/applications/:id: Retrieve single application (ownership check)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const DonorProfile = require('../models/DonorProfile');
const DonorApplication = require('../models/DonorApplication');
const HospitalProfile = require('../models/HospitalProfile');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { requireDatabase } = require('../config/db');
const { handleProfileUpload, deletePreviousProfilePicture, cleanupNewFile } = require('../middleware/upload');

// All donor routes require MongoDB, authentication, and donor role
router.use(requireDatabase);
router.use(protect);
router.use(authorize('donor'));

/**
 * @route   GET /api/donor/profile
 * @desc    Get authenticated donor profile
 * @access  Private (Donor only)
 */
router.get('/profile', async (req, res) => {
  try {
    const profile = await DonorProfile.findOne({ user: req.user._id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Donor profile not found for this user account.'
      });
    }

    res.status(200).json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Get donor profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving donor profile.'
    });
  }
});

/**
 * @route   PUT /api/donor/profile
 * @desc    Update permitted profile fields
 * @access  Private (Donor only)
 */
router.put('/profile', async (req, res) => {
  try {
    const profile = await DonorProfile.findOne({ user: req.user._id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Donor profile not found.'
      });
    }

    const {
      contact,
      age,
      bloodGroup,
      locality,
      city,
      state,
      pincode,
      availability,
      healthMetrics,
      coordinates
    } = req.body;

    if (contact) profile.contact = contact.trim();
    if (age) profile.age = Number(age);
    if (bloodGroup) profile.bloodGroup = bloodGroup.trim();
    if (locality) profile.locality = locality.trim();
    if (city) profile.city = city.trim();
    if (state) profile.state = state.trim();
    if (pincode) profile.pincode = pincode.trim();
    if (availability) profile.availability = availability.trim();

    if (healthMetrics && typeof healthMetrics === 'object') {
      profile.healthMetrics = {
        ...profile.healthMetrics,
        ...healthMetrics
      };
    }

    if (coordinates && coordinates.lat !== undefined && coordinates.lng !== undefined) {
      profile.coordinates = {
        lat: Number(coordinates.lat),
        lng: Number(coordinates.lng)
      };
    }

    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Donor profile updated successfully.',
      data: profile
    });
  } catch (error) {
    console.error('Update donor profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating profile.'
    });
  }
});

/**
 * @route   POST /api/donor/profile/picture
 * @desc    Upload or update donor profile picture (JPG, PNG, WEBP <= 2MB)
 * @access  Private (Donor only)
 */
const uploadDonorPhoto = async (req, res) => {
  try {
    let profile = await DonorProfile.findOne({ user: req.user._id });
    if (!profile) {
      profile = new DonorProfile({
        user: req.user._id,
        name: req.user.name,
        email: req.user.email,
        contact: req.user.phone || '9876543210',
        age: 25,
        gender: 'Other',
        bloodGroup: 'O+',
        city: 'Chandigarh',
        donationType: 'Blood'
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
    console.error('Donor profile picture upload error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error saving profile picture.'
    });
  }
};

router.post('/profile/picture', handleProfileUpload, uploadDonorPhoto);
router.post('/profile-picture', handleProfileUpload, uploadDonorPhoto);

/**
 * @route   POST /api/donor/applications
 * @desc    Submit a new volunteer donation application directed to a target hospital
 * @access  Private (Donor only)
 */
router.post('/applications', async (req, res) => {
  try {
    const {
      hospitalId,
      donationType,
      donationCategory,
      bloodGroup,
      requiredUnits,
      preferredDonationDate,
      selectedOrgan,
      organCity,
      additionalInfo,
      city,
      state,
      pincode,
      contact,
      age,
      gender,
      healthInformation
    } = req.body;

    if (!hospitalId || !donationType) {
      return res.status(400).json({
        success: false,
        message: 'Please select target hospital and donation type.'
      });
    }

    // Verify hospital exists by valid ObjectId in verified registry
    if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
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
        message: 'The selected target hospital was not found in the verified registry.'
      });
    }

    // Donor attributes must be provided explicitly without silent fallbacks
    const donorProfile = await DonorProfile.findOne({ user: req.user._id });

    const finalAge = age ? Number(age) : null;
    const finalContact = contact ? contact.trim() : '';
    const finalCity = city ? city.trim() : (donorProfile ? donorProfile.city : '');
    const finalBloodGroup = bloodGroup ? bloodGroup.trim() : '';

    if (!finalContact) {
      return res.status(400).json({
        success: false,
        message: 'Contact phone number is required.'
      });
    }

    if (!finalAge || isNaN(finalAge) || finalAge < 18 || finalAge > 65) {
      return res.status(400).json({
        success: false,
        message: 'Valid donor age between 18 and 65 is required.'
      });
    }

    if (!finalBloodGroup) {
      return res.status(400).json({
        success: false,
        message: 'Blood group specification is required.'
      });
    }

    const application = await DonorApplication.create({
      donor: req.user._id,
      donorName: req.user.name,
      donorAge: finalAge,
      gender: gender || (donorProfile ? donorProfile.gender : 'Other'),
      donorContact: finalContact,
      donorEmail: req.user.email,
      city: finalCity,
      state: state ? state.trim() : (donorProfile ? donorProfile.state : ''),
      pincode: pincode ? pincode.trim() : (donorProfile ? donorProfile.pincode : ''),
      hospital: hospital._id,
      hospitalName: hospital.hospitalName,
      donationType: donationType.trim(),
      donationCategory: donationCategory || (donationType.toLowerCase().includes('blood') ? 'Blood' : 'Organ/Tissue'),
      bloodGroup: finalBloodGroup,
      requiredUnits: Number(requiredUnits) || 1,
      preferredDonationDate: preferredDonationDate ? preferredDonationDate.trim() : '',
      selectedOrgan: selectedOrgan ? selectedOrgan.trim() : '',
      organCity: organCity ? organCity.trim() : '',
      additionalInfo: additionalInfo ? additionalInfo.trim() : '',
      healthInformation: healthInformation || {},
      status: 'Pending Review'
    });

    // Notify hospital staff
    await Notification.create({
      recipient: hospital.user,
      recipientRole: 'hospital',
      title: 'New Volunteer Donor Application Received',
      message: `${req.user.name} submitted a volunteer pledge for ${donationType} (${bloodGroup || 'Standard'}).`,
      type: 'donor_application',
      relatedId: application._id.toString()
    });

    res.status(201).json({
      success: true,
      message: 'Donation application submitted to hospital review queue successfully.',
      data: application
    });
  } catch (error) {
    console.error('Submit donor application error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error submitting donor application.'
    });
  }
});

/**
 * @route   GET /api/donor/applications
 * @desc    Retrieve all applications submitted by the authenticated donor
 * @access  Private (Donor only)
 */
router.get('/applications', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { donor: req.user._id };

    if (status && status !== 'All' && status !== 'all') {
      filter.status = status;
    }

    const applications = await DonorApplication.find(filter)
      .sort({ createdAt: -1 })
      .populate('hospital', 'hospitalName address locality contact city');

    res.status(200).json({
      success: true,
      count: applications.length,
      data: applications
    });
  } catch (error) {
    console.error('Fetch donor applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving your applications.'
    });
  }
});

/**
 * @route   GET /api/donor/applications/:id
 * @desc    Retrieve single application details (ownership check)
 * @access  Private (Donor only)
 */
router.get('/applications/:id', async (req, res) => {
  try {
    const application = await DonorApplication.findById(req.params.id)
      .populate('hospital', 'hospitalName address locality contact city');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    // Ownership check: must belong to this donor
    if (application.donor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_RECORD',
        message: 'Access denied: You do not have permission to view this application.'
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
      message: 'Server error retrieving application details.'
    });
  }
});

/**
 * @route   GET /api/donor/hospitals
 * @desc    Get list of verified hospitals for donation application target
 * @access  Private (Donor only)
 */
router.get('/hospitals', async (req, res) => {
  try {
    const rawHospitals = await HospitalProfile.find({
      active: { $ne: false },
      isVerified: { $ne: false }
    })
      .select('hospitalName locality city address contact')
      .sort({ hospitalName: 1 });

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
          displayName: `${h.hospitalName} — ${h.locality ? h.locality + ', ' : ''}${h.city || 'Punjab'}`
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
      message: 'Server error retrieving hospitals.'
    });
  }
});

module.exports = router;
