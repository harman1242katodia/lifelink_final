/**
 * ==============================================================================
 * LifeLink — Authentication Routes
 * ==============================================================================
 * 
 * Handles user registration and login across all three roles:
 * - Patient
 * - Hospital
 * - Donor
 * Implements bcrypt password hashing, JWT generation, and linked profile creation.
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PatientProfile = require('../models/PatientProfile');
const HospitalProfile = require('../models/HospitalProfile');
const DonorProfile = require('../models/DonorProfile');
const { generateToken, protect } = require('../middleware/auth');
const { requireDatabase } = require('../config/db');

// All auth routes require MongoDB connectivity
router.use(requireDatabase);

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (patient, hospital, or donor) and create their profile
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, phone, ...profileData } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, password, and role.'
      });
    }

    const cleanRole = String(role).toLowerCase().trim();
    if (!['patient', 'hospital', 'donor'].includes(cleanRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified. Must be "patient", "hospital", or "donor".'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address is already registered. Please sign in.'
      });
    }

    // Prevent duplicate hospital registrations for existing facilities
    if (cleanRole === 'hospital') {
      const candidateName = (profileData.hospitalName || name).trim();
      const existingHosp = await HospitalProfile.findOne({
        hospitalName: new RegExp('^' + candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
        active: true
      });
      if (existingHosp) {
        return res.status(400).json({
          success: false,
          message: `The medical facility "${candidateName}" is already registered in the LifeLink network. Please sign in.`
        });
      }
    }

    // Create user record (pre-save hook hashes password via bcrypt)
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: cleanRole,
      phone: phone ? phone.trim() : ''
    });

    // Create corresponding profile based on role
    let patientIsComplete = false;
    if (cleanRole === 'patient') {
      const isComplete = Boolean(
        profileData.phone &&
        profileData.age &&
        profileData.bloodGroup &&
        profileData.address &&
        profileData.city
      );
      patientIsComplete = isComplete;
      await PatientProfile.create({
        user: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || profileData.contact || '',
        age: profileData.age ? Number(profileData.age) : undefined,
        gender: profileData.gender ? profileData.gender : undefined,
        bloodGroup: profileData.bloodGroup ? profileData.bloodGroup : undefined,
        address: profileData.address || '',
        locality: profileData.locality || profileData.city || '',
        city: profileData.city || '',
        state: profileData.state || '',
        pincode: profileData.pincode || '',
        isProfileComplete: isComplete,
        coordinates: profileData.coordinates || null
      });
    } else if (cleanRole === 'hospital') {
      await HospitalProfile.create({
        user: user._id,
        hospitalName: profileData.hospitalName || user.name,
        licenseNumber: profileData.licenseNumber || `LIC-${Date.now().toString().slice(-6)}`,
        address: profileData.address || 'Address pending verification',
        locality: profileData.locality || profileData.city || 'Central',
        city: profileData.city || 'Chandigarh',
        contact: profileData.contact || user.phone || '9876543210',
        email: user.email,
        active: true,
        isVerified: true,
        coordinates: profileData.coordinates || { lat: 30.7415, lng: 76.7766 }
      });
    } else if (cleanRole === 'donor') {
      await DonorProfile.create({
        user: user._id,
        name: user.name,
        age: profileData.age || 25,
        gender: profileData.gender || 'Other',
        bloodGroup: profileData.bloodGroup || 'O+',
        contact: profileData.contact || user.phone || '9876543210',
        email: user.email,
        city: profileData.city || 'Chandigarh',
        locality: profileData.locality || 'Central',
        donationType: profileData.donationType || 'Blood',
        healthInformation: profileData.healthInformation || {}
      });
    }

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isProfileComplete: cleanRole === 'patient' ? patientIsComplete : undefined
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration.'
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user, verify bcrypt password, and return JWT
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.'
      });
    }

    // Find user with password field
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Email is not registered.'
      });
    }

    // Verify password with bcrypt
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.'
      });
    }

    // Role check if specified by client
    if (role && String(role).toLowerCase() !== user.role) {
      return res.status(403).json({
        success: false,
        message: `This account is registered as a "${user.role}", not "${role}". Please select the correct role.`
      });
    }

    const token = generateToken(user);

    // Retrieve linked profile identifier
    let profileId = null;
    let profileData = null;

    if (user.role === 'hospital') {
      const hp = await HospitalProfile.findOne({ user: user._id });
      if (hp) {
        profileId = hp._id;
        profileData = { hospitalName: hp.hospitalName, locality: hp.locality };
      }
    } else if (user.role === 'patient') {
      const pp = await PatientProfile.findOne({ user: user._id });
      if (pp) {
        profileId = pp._id;
        profileData = {
          bloodGroup: pp.bloodGroup,
          locality: pp.locality,
          city: pp.city,
          isProfileComplete: Boolean(pp.isProfileComplete)
        };
      }
    } else if (user.role === 'donor') {
      const dp = await DonorProfile.findOne({ user: user._id });
      if (dp) {
        profileId = dp._id;
        profileData = { bloodGroup: dp.bloodGroup, donationType: dp.donationType };
      }
    }

    res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileId,
        profileData,
        isProfileComplete: user.role === 'patient' && profileData ? Boolean(profileData.isProfileComplete) : undefined
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during login.'
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get currently authenticated user details & profile
 * @access  Private
 */
router.get('/me', protect, async (req, res) => {
  try {
    let profile = null;

    if (req.user.role === 'hospital') {
      profile = await HospitalProfile.findOne({ user: req.user._id });
    } else if (req.user.role === 'patient') {
      profile = await PatientProfile.findOne({ user: req.user._id });
    } else if (req.user.role === 'donor') {
      profile = await DonorProfile.findOne({ user: req.user._id });
    }

    res.status(200).json({
      success: true,
      user: req.user,
      profile
    });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error verifying session.'
    });
  }
});

module.exports = router;
