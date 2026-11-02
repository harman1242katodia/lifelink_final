/**
 * ==============================================================================
 * LifeLink — Database Seed Utility
 * ==============================================================================
 * 
 * Automatically populates verified initial records (Hospitals, Donors, Patients,
 * Requests, and Applications) if the database is currently empty.
 * Ensures the system is immediately testable without requiring manual bootstrapping.
 * ==============================================================================
 */

const User = require('../models/User');
const HospitalProfile = require('../models/HospitalProfile');
const DonorProfile = require('../models/DonorProfile');
const PatientProfile = require('../models/PatientProfile');
const PatientRequest = require('../models/PatientRequest');
const DonorApplication = require('../models/DonorApplication');
const Notification = require('../models/Notification');
const { calculateRequestPriority } = require('../middleware/priority');

const seedDatabase = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      // Database already has records, skip seeding
      return;
    }

    console.log(' [SEED] Populating verified starter records into MongoDB...');

    // 1. CREATE HOSPITAL USERS & PROFILES
    const hospital1User = await User.create({
      name: 'City Care Hospital Staff',
      email: 'hospital@citycare.com',
      password: 'Password123!',
      role: 'hospital',
      phone: '9876543210'
    });

    const hospital1Profile = await HospitalProfile.create({
      user: hospital1User._id,
      hospitalName: 'City Care Hospital',
      licenseNumber: 'LIC-MED-2026-9901',
      address: 'Madhya Marg, Sector 16',
      locality: 'Sector 16',
      city: 'Chandigarh',
      state: 'Punjab',
      pincode: '160015',
      contact: '9876543210',
      email: 'hospital@citycare.com',
      coordinates: { lat: 30.7415, lng: 76.7766 },
      availableBloodStock: [
        { bloodGroup: 'O+', units: 12 },
        { bloodGroup: 'A+', units: 8 },
        { bloodGroup: 'B+', units: 6 },
        { bloodGroup: 'O-', units: 3 }
      ]
    });

    const hospital2User = await User.create({
      name: 'PGI Chandigarh Clinical Desk',
      email: 'hospital@pgi.edu',
      password: 'Password123!',
      role: 'hospital',
      phone: '9876543211'
    });

    const hospital2Profile = await HospitalProfile.create({
      user: hospital2User._id,
      hospitalName: 'PGI Chandigarh',
      licenseNumber: 'LIC-PGI-EST-1962',
      address: 'Kairon Block, Sector 12',
      locality: 'Sector 12',
      city: 'Chandigarh',
      state: 'Punjab',
      pincode: '160012',
      contact: '9876543211',
      email: 'hospital@pgi.edu',
      coordinates: { lat: 30.7628, lng: 76.7758 },
      availableBloodStock: [
        { bloodGroup: 'O-', units: 10 },
        { bloodGroup: 'AB+', units: 5 },
        { bloodGroup: 'A-', units: 4 }
      ]
    });

    const hospital3User = await User.create({
      name: 'Fortis Mohali Transplant Center',
      email: 'hospital@fortis.org',
      password: 'Password123!',
      role: 'hospital',
      phone: '9876543212'
    });

    const hospital3Profile = await HospitalProfile.create({
      user: hospital3User._id,
      hospitalName: 'Fortis Hospital',
      licenseNumber: 'LIC-FORTIS-MOH-2001',
      address: 'Sector 62, Phase 8',
      locality: 'Sector 62',
      city: 'Mohali',
      state: 'Punjab',
      pincode: '160062',
      contact: '9876543212',
      email: 'hospital@fortis.org',
      coordinates: { lat: 30.7046, lng: 76.7179 },
      availableBloodStock: [
        { bloodGroup: 'B+', units: 14 },
        { bloodGroup: 'O+', units: 9 },
        { bloodGroup: 'B-', units: 3 }
      ]
    });

    // 2. CREATE PATIENT USER & PROFILE
    const patientUser = await User.create({
      name: 'Harman Verma',
      email: 'patient@lifelink.org',
      password: 'Password123!',
      role: 'patient',
      phone: '9876500001'
    });

    const patientProfile = await PatientProfile.create({
      user: patientUser._id,
      name: 'Harman Verma',
      email: 'patient@lifelink.org',
      phone: '9876500001',
      age: 21,
      gender: 'Female',
      bloodGroup: 'O+',
      address: 'House 412, Sector 22-B',
      locality: 'Sector 22',
      city: 'Chandigarh',
      coordinates: { lat: 30.7320, lng: 76.7680 },
      emergencyContact: {
        name: 'Rajesh Verma',
        phone: '9876512345',
        relationship: 'Parent'
      },
      medicalCondition: 'Under surgical evaluation',
      organRequirement: 'None'
    });

    // 3. CREATE DONOR USERS & PROFILES
    const donor1User = await User.create({
      name: 'Aarav Sharma',
      email: 'donor@lifelink.org',
      password: 'Password123!',
      role: 'donor',
      phone: '9876543210'
    });

    await DonorProfile.create({
      user: donor1User._id,
      name: 'Aarav Sharma',
      age: 28,
      gender: 'Male',
      bloodGroup: 'O+',
      contact: '9876543210',
      email: 'donor@lifelink.org',
      city: 'Chandigarh',
      locality: 'Sector 16',
      state: 'Punjab',
      pincode: '160015',
      coordinates: { lat: 30.7415, lng: 76.7766 },
      donationType: 'Blood',
      associatedHospital: hospital1Profile._id,
      associatedHospitalName: 'City Care Hospital',
      availability: 'Available',
      healthInformation: {
        weight: 68,
        hemoglobin: 14.5,
        bloodPressure: '120/80',
        chronicDisease: 'No',
        medication: 'No',
        allergies: 'None',
        smoker: 'No'
      }
    });

    const donor2User = await User.create({
      name: 'Meera Patel',
      email: 'meera.p@lifelink.org',
      password: 'Password123!',
      role: 'donor',
      phone: '9812345678'
    });

    await DonorProfile.create({
      user: donor2User._id,
      name: 'Meera Patel',
      age: 34,
      gender: 'Female',
      bloodGroup: 'A-',
      contact: '9812345678',
      email: 'meera.p@lifelink.org',
      city: 'Chandigarh',
      locality: 'Sector 15',
      state: 'Punjab',
      pincode: '160014',
      coordinates: { lat: 30.7480, lng: 76.7690 },
      donationType: 'Blood',
      associatedHospital: hospital1Profile._id,
      associatedHospitalName: 'City Care Hospital',
      availability: 'Available',
      healthInformation: {
        weight: 59,
        hemoglobin: 13.2,
        bloodPressure: '118/76',
        chronicDisease: 'No',
        medication: 'No',
        allergies: 'None',
        smoker: 'No'
      }
    });

    const donor3User = await User.create({
      name: 'Vikramaditya Sengupta',
      email: 'vikram.s@lifelink.org',
      password: 'Password123!',
      role: 'donor',
      phone: '9711223344'
    });

    await DonorProfile.create({
      user: donor3User._id,
      name: 'Vikramaditya Sengupta',
      age: 29,
      gender: 'Male',
      bloodGroup: 'O-',
      contact: '9711223344',
      email: 'vikram.s@lifelink.org',
      city: 'Chandigarh',
      locality: 'Sector 12',
      state: 'Punjab',
      pincode: '160012',
      coordinates: { lat: 30.7628, lng: 76.7758 },
      donationType: 'Blood',
      associatedHospital: hospital2Profile._id,
      associatedHospitalName: 'PGI Chandigarh',
      availability: 'Available',
      healthInformation: {
        weight: 75,
        hemoglobin: 15.4,
        bloodPressure: '120/78',
        chronicDisease: 'No',
        medication: 'No',
        allergies: 'None',
        smoker: 'No'
      }
    });

    const donor4User = await User.create({
      name: 'Rohan Deshmukh',
      email: 'rohan.d@lifelink.org',
      password: 'Password123!',
      role: 'donor',
      phone: '9988776655'
    });

    await DonorProfile.create({
      user: donor4User._id,
      name: 'Rohan Deshmukh',
      age: 41,
      gender: 'Male',
      bloodGroup: 'B+',
      contact: '9988776655',
      email: 'rohan.d@lifelink.org',
      city: 'Mohali',
      locality: 'Sector 62',
      state: 'Punjab',
      pincode: '160062',
      coordinates: { lat: 30.7046, lng: 76.7179 },
      donationType: 'Kidney',
      associatedHospital: hospital3Profile._id,
      associatedHospitalName: 'Fortis Hospital',
      availability: 'Available',
      healthInformation: {
        weight: 72,
        hemoglobin: 15.0,
        bloodPressure: '122/82',
        chronicDisease: 'No',
        medication: 'No',
        allergies: 'Penicillin',
        smoker: 'No'
      }
    });

    // 4. CREATE PATIENT REQUESTS (Review & Response Workflow)
    const prio1 = calculateRequestPriority('Critical', new Date(Date.now() - 3600000));
    await PatientRequest.create({
      patient: patientUser._id,
      patientName: 'Harman Verma',
      patientContact: '9876500001',
      hospital: hospital1Profile._id,
      hospitalName: 'City Care Hospital',
      donationType: 'Blood',
      bloodGroup: 'O+',
      requiredUnits: 2,
      urgency: 'Critical',
      priority: prio1.priority,
      priorityReason: prio1.reason,
      location: 'Chandigarh, Sector 16 Ward 4',
      locality: 'Sector 16',
      description: 'Emergency whole blood requirement for acute medical procedure.',
      status: 'Pending Review'
    });

    const prio2 = calculateRequestPriority('High', new Date(Date.now() - 86400000));
    await PatientRequest.create({
      patient: patientUser._id,
      patientName: 'Harman Verma',
      patientContact: '9876500001',
      hospital: hospital2Profile._id,
      hospitalName: 'PGI Chandigarh',
      donationType: 'Blood',
      bloodGroup: 'O-',
      requiredUnits: 1,
      urgency: 'High',
      priority: prio2.priority,
      priorityReason: prio2.reason,
      location: 'PGI Emergency Trauma Center',
      locality: 'Sector 12',
      description: 'Universal O- negative backup blood requested for scheduled surgery.',
      status: 'Reviewed — Response Sent',
      responses: [
        {
          senderUser: hospital2User._id,
          senderName: 'Dr. S. K. Gupta',
          hospitalName: 'PGI Chandigarh',
          message: 'We have reviewed your request. Our team has verified O- donor compatibility in Sector 12 and will contact you directly with instructions.',
          statusAtResponse: 'Reviewed — Response Sent',
          timestamp: new Date()
        }
      ]
    });

    // 5. CREATE DONOR APPLICATIONS (Decision Workflow)
    await DonorApplication.create({
      donor: donor1User._id,
      donorName: 'Aarav Sharma',
      donorAge: 28,
      gender: 'Male',
      donorContact: '9876543210',
      donorEmail: 'donor@lifelink.org',
      city: 'Chandigarh',
      state: 'Punjab',
      pincode: '160015',
      hospital: hospital1Profile._id,
      hospitalName: 'City Care Hospital',
      donationType: 'Blood',
      donationCategory: 'Blood',
      bloodGroup: 'O+',
      requiredUnits: 1,
      preferredDonationDate: '2026-10-28',
      healthInformation: {
        weight: 68,
        hemoglobin: 14.5,
        bloodPressure: '120/80',
        chronicDisease: 'No',
        medication: 'No',
        allergies: 'None',
        smoker: 'No'
      },
      status: 'Pending Review'
    });

    await DonorApplication.create({
      donor: donor4User._id,
      donorName: 'Rohan Deshmukh',
      donorAge: 41,
      gender: 'Male',
      donorContact: '9988776655',
      donorEmail: 'rohan.d@lifelink.org',
      city: 'Mohali',
      state: 'Punjab',
      pincode: '160062',
      hospital: hospital3Profile._id,
      hospitalName: 'Fortis Hospital',
      donationType: 'Kidney',
      donationCategory: 'Organ/Tissue',
      bloodGroup: 'B+',
      selectedOrgan: 'Kidney',
      organCity: 'Mohali',
      additionalInfo: 'Living donor candidate willing to undergo HLA typing.',
      healthInformation: {
        weight: 72,
        hemoglobin: 15.0,
        bloodPressure: '122/82',
        chronicDisease: 'No',
        medication: 'No',
        allergies: 'Penicillin',
        smoker: 'No'
      },
      status: 'Accepted',
      hospitalDecision: {
        decision: 'Accepted',
        explanation: 'Living donor preliminary assessment approved. HLA cross-match appointment arranged.',
        decidedBy: hospital3User._id,
        decidedAt: new Date()
      }
    });

    console.log(' [SEED] Verified starter database records created successfully.');
  } catch (error) {
    console.error(' [SEED ERROR] Failed to seed initial data:', error);
  }
};

module.exports = seedDatabase;
