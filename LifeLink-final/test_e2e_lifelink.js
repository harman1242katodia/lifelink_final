/**
 * LifeLink End-to-End Verification Test Suite
 * Tests all required fixes for Donor Submission, Role Guards, PGI Deduplication, and Hospital Review
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000/api';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log(' LIFELINK FULL VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  [PASS] Test ${total}: ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] Test ${total}: ${message}`);
    }
  }

  // 1. Check Server Health
  console.log('--- 1. SYSTEM HEALTH ---');
  const health = await request('GET', '/health');
  assert(health.status === 200 && health.data.database && health.data.database.includes('Connected'), 'Server is healthy and MongoDB is connected');

  // 2. Hospital Deduplication in Donor Dropdown
  console.log('\n--- 2. HOSPITAL DROPDOWNS & PGI CONSOLIDATION ---');
  // Need donor token to get donor hospitals
  const donorLogin = await request('POST', '/auth/login', {
    email: 'donor@lifelink.org',
    password: 'Password123!'
  });
  assert(donorLogin.status === 200 && donorLogin.data.token, 'Donor login successful');
  const donorToken = donorLogin.data.token;

  const donorHospitals = await request('GET', '/donor/hospitals', null, donorToken);
  assert(donorHospitals.status === 200 && Array.isArray(donorHospitals.data.data), 'Donor hospitals endpoint returns 200 array');
  
  const dhList = donorHospitals.data.data;
  const pgiDonorMatches = dhList.filter(h => h.hospitalName.toLowerCase().includes('pgi'));
  assert(pgiDonorMatches.length === 1, `PGI appears exactly ONCE in donor hospitals (Found: ${pgiDonorMatches.length})`);
  assert(pgiDonorMatches[0]._id === '6adf7135858ca8094a7a60df', `Canonical PGI ID 6adf7135858ca8094a7a60df verified`);
  assert(dhList.some(h => h.hospitalName.includes('City Care')), 'City Care Hospital is present in dropdown');
  assert(dhList.some(h => h.hospitalName.includes('Fortis')), 'Fortis Hospital is present in dropdown');
  assert(!dhList.some(h => h._id === '6adf79266f1f88cbf5708774' || h._id === '6ae0220acac64764d704458a'), 'Deactivated duplicate PGI records are excluded');

  // Patient hospitals dropdown
  const patientLogin = await request('POST', '/auth/login', {
    email: 'patient@lifelink.org',
    password: 'Password123!'
  });
  assert(patientLogin.status === 200 && patientLogin.data.token, 'Patient login successful');
  const patientToken = patientLogin.data.token;

  const patientHospitals = await request('GET', '/patient/hospitals', null, patientToken);
  assert(patientHospitals.status === 200 && Array.isArray(patientHospitals.data.data), 'Patient hospitals endpoint returns 200 array');
  const phList = patientHospitals.data.data;
  const pgiPatientMatches = phList.filter(h => h.hospitalName.toLowerCase().includes('pgi'));
  assert(pgiPatientMatches.length === 1, `PGI appears exactly ONCE in patient hospitals (Found: ${pgiPatientMatches.length})`);

  // 3. Hospital Login
  console.log('\n--- 3. HOSPITAL AUTHENTICATION & PORTAL ACCESS ---');
  const hospLogin = await request('POST', '/auth/login', {
    email: 'hospital@pgi.edu',
    password: 'Password123!'
  });
  assert(hospLogin.status === 200 && hospLogin.data.token, 'PGI Hospital login successful');
  const hospToken = hospLogin.data.token;
  assert(hospLogin.data.user.role === 'hospital', 'Authenticated user role is hospital');

  // 4. Role Authorization: Hospital cannot submit donor application
  console.log('\n--- 4. ROLE-BASED ACCESS CONTROL (RBAC) ---');
  const hospitalAttemptSubmit = await request('POST', '/donor/applications', {
    hospitalId: '6adf7135858ca8094a7a60df',
    donationType: 'Blood',
    age: 30,
    contact: '9876543210',
    bloodGroup: 'O+'
  }, hospToken);
  assert(hospitalAttemptSubmit.status === 403, `Hospital user blocked from donor submission (HTTP ${hospitalAttemptSubmit.status})`);
  assert(hospitalAttemptSubmit.data.message && hospitalAttemptSubmit.data.message.includes('not authorized'), 'Proper 403 Forbidden message received');

  const patientAttemptSubmit = await request('POST', '/donor/applications', {
    hospitalId: '6adf7135858ca8094a7a60df',
    donationType: 'Blood',
    age: 30,
    contact: '9876543210',
    bloodGroup: 'O+'
  }, patientToken);
  assert(patientAttemptSubmit.status === 403, `Patient user blocked from donor submission (HTTP ${patientAttemptSubmit.status})`);

  const anonAttemptSubmit = await request('POST', '/donor/applications', {
    hospitalId: '6adf7135858ca8094a7a60df',
    donationType: 'Blood'
  }, null);
  assert(anonAttemptSubmit.status === 401, `Unauthenticated user blocked from donor submission (HTTP ${anonAttemptSubmit.status})`);

  // 5. Donor Application Validation
  console.log('\n--- 5. DONOR APPLICATION VALIDATION ---');
  const invalidAppMissing = await request('POST', '/donor/applications', {
    hospitalId: '6adf7135858ca8094a7a60df',
    donationType: 'Blood'
    // Missing required age and contact
  }, donorToken);
  // Expecting 400 or valid rejection
  assert(invalidAppMissing.status === 400, `Application missing required fields rejected with HTTP ${invalidAppMissing.status}`);

  const invalidAppBadHospital = await request('POST', '/donor/applications', {
    hospitalId: '6adf79266f1f88cbf5708774', // Deactivated duplicate hospital ID
    donationType: 'Blood',
    age: 26,
    contact: '9876543210',
    bloodGroup: 'O+'
  }, donorToken);
  assert(invalidAppBadHospital.status === 404 || invalidAppBadHospital.status === 400, `Deactivated hospital rejected with HTTP ${invalidAppBadHospital.status}`);

  // 6. Valid Donor Application Submission
  console.log('\n--- 6. VALID DONOR APPLICATION SUBMISSION ---');
  const validAppPayload = {
    hospitalId: '6adf7135858ca8094a7a60df', // Canonical PGI
    donationType: 'Blood',
    donationCategory: 'Blood',
    bloodGroup: 'A+',
    requiredUnits: 1,
    preferredDonationDate: '2026-11-15',
    city: 'Chandigarh',
    state: 'Chandigarh',
    pincode: '160012',
    contact: '9876543210',
    age: 27,
    gender: 'Male',
    healthInformation: {
      weight: 68,
      hemoglobin: 14.5,
      bloodPressure: '120/80',
      chronicDisease: 'No',
      medication: 'No',
      allergies: 'None',
      smoker: 'No'
    }
  };

  const submitAppRes = await request('POST', '/donor/applications', validAppPayload, donorToken);
  assert(submitAppRes.status === 201, `Valid donor application created with HTTP ${submitAppRes.status}`);
  assert(submitAppRes.data.success === true, 'Application submission marked success');
  const createdAppId = submitAppRes.data.data._id;
  assert(Boolean(createdAppId), `Application assigned MongoDB ID: ${createdAppId}`);

  // Check application in donor's own history
  const donorHistory = await request('GET', '/donor/applications', null, donorToken);
  assert(donorHistory.status === 200, 'Donor can retrieve own application history');
  const foundInHistory = donorHistory.data.data.find(a => a._id === createdAppId);
  assert(Boolean(foundInHistory), 'Submitted application is present in donor history');
  assert(foundInHistory.status === 'Pending Review', 'Initial application status is Pending Review');

  // 7. Verify Application in PGI Hospital Review Portal
  console.log('\n--- 7. HOSPITAL CLINICAL REVIEW & NOTIFICATIONS ---');
  const hospApps = await request('GET', '/hospital/applications', null, hospToken);
  assert(hospApps.status === 200, 'Hospital can retrieve applications queue');
  const foundInHospQueue = hospApps.data.data.find(a => a._id === createdAppId);
  assert(Boolean(foundInHospQueue), 'Submitted application is visible in target hospital review queue');

  // Hospital accepts application
  const decideApp = await request('POST', `/hospital/applications/${createdAppId}/decision`, {
    decision: 'Accepted',
    instructions: 'Please report to Blood Bank Ward 3 on preferred date.',
    explanation: 'Clinical vitals pass screening criteria.'
  }, hospToken);
  assert(decideApp.status === 200, `Hospital can decide on application (HTTP ${decideApp.status})`);
  assert(decideApp.data.data.status === 'Accepted', 'Application status updated to Accepted');

  // Verify donor sees accepted status
  const donorHistoryAfterDecision = await request('GET', `/donor/applications/${createdAppId}`, null, donorToken);
  assert(donorHistoryAfterDecision.status === 200, 'Donor can fetch updated application details');
  assert(donorHistoryAfterDecision.data.data.status === 'Accepted', 'Donor sees accepted status');
  assert(donorHistoryAfterDecision.data.data.hospitalDecision.decision === 'Accepted', 'Donor sees hospital decision text');

  // 8. Patient Emergency Request to Canonical PGI
  console.log('\n--- 8. PATIENT EMERGENCY REQUEST WORKFLOW ---');
  const createPatientReq = await request('POST', '/patient/requests', {
    hospitalId: '6adf7135858ca8094a7a60df',
    donationType: 'Blood',
    bloodGroup: 'B+',
    requiredUnits: 2,
    urgency: 'Critical',
    location: 'Chandigarh Emergency Ward',
    description: 'Urgent requirement for surgical preparation.'
  }, patientToken);

  assert(createPatientReq.status === 201, `Patient emergency request created (HTTP ${createPatientReq.status})`);
  const patientReqId = createPatientReq.data.data._id;
  assert(createPatientReq.data.data.hospital === '6adf7135858ca8094a7a60df', 'Emergency request correctly mapped to canonical PGI');

  // Verify visible in hospital requests queue
  const hospPatientRequests = await request('GET', '/hospital/requests', null, hospToken);
  assert(hospPatientRequests.status === 200, 'Hospital can retrieve patient requests queue');
  const foundPatientReq = hospPatientRequests.data.data.find(r => r._id === patientReqId);
  assert(Boolean(foundPatientReq), 'Emergency request is visible in PGI clinical queue');

  // Hospital responds to patient request
  const respondPatientReq = await request('POST', `/hospital/requests/${patientReqId}/respond`, {
    status: 'Reviewed — Response Sent',
    message: '2 units of B+ blood allocated. Transport team dispatched.'
  }, hospToken);
  assert(respondPatientReq.status === 200, `Hospital clinical response submitted (HTTP ${respondPatientReq.status})`);

  // Patient sees response
  const patientReqDetails = await request('GET', `/patient/requests/${patientReqId}`, null, patientToken);
  assert(patientReqDetails.status === 200, 'Patient can retrieve own request');
  assert(patientReqDetails.data.data.status === 'Reviewed — Response Sent', 'Patient sees Reviewed status');
  assert(patientReqDetails.data.data.responses.length > 0, 'Patient sees hospital clinical response text');

  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} / ${total} TESTS PASSED (${((passed/total)*100).toFixed(1)}%)`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('ALL VERIFICATION CHECKS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error('SOME CHECKS FAILED. PLEASE INVESTIGATE.\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
