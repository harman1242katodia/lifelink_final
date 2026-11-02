/**
 * End-to-End Test Suite for LifeLink Backend APIs
 */
const http = require('http');
const { startServer } = require('./server');

let server;
const BASE_URL = 'http://localhost:5000';

async function makeRequest(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
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
  console.log('\n--- Starting LifeLink E2E Verification Tests ---');
  server = await startServer();

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    const health = await makeRequest('/api/health');
    assert(health.status === 200 && health.data.status === 'UP', 'Health check returns 200 UP and MongoDB connected');

    // 2. Authentication: Patient Login
    const patientLogin = await makeRequest('/api/auth/login', 'POST', {
      email: 'patient@lifelink.org',
      password: 'Password123!'
    });
    assert(patientLogin.status === 200 && patientLogin.data.token, 'Patient login returns 200 and JWT');
    const patientToken = patientLogin.data.token;

    // 3. Authentication: Hospital Login
    const hospitalLogin = await makeRequest('/api/auth/login', 'POST', {
      email: 'hospital@citycare.com',
      password: 'Password123!'
    });
    assert(hospitalLogin.status === 200 && hospitalLogin.data.token, 'Hospital login returns 200 and JWT');
    const hospitalToken = hospitalLogin.data.token;

    // 4. Authentication: Donor Login
    const donorLogin = await makeRequest('/api/auth/login', 'POST', {
      email: 'donor@lifelink.org',
      password: 'Password123!'
    });
    assert(donorLogin.status === 200 && donorLogin.data.token, 'Donor login returns 200 and JWT');
    const donorToken = donorLogin.data.token;

    // 5. Auth /me check
    const meCheck = await makeRequest('/api/auth/me', 'GET', null, patientToken);
    assert(meCheck.status === 200 && meCheck.data.user.role === 'patient', 'GET /api/auth/me returns authenticated patient');

    // 6. Role Authorization: Donor cannot access patient requests
    const unauthorizedPatientReq = await makeRequest('/api/patient/requests', 'GET', null, donorToken);
    assert(unauthorizedPatientReq.status === 403, 'Donor is forbidden (403) from accessing patient routes');

    // 7. Role Authorization: Patient cannot access hospital routes
    const unauthorizedHospitalReq = await makeRequest('/api/hospital/requests', 'GET', null, patientToken);
    assert(unauthorizedHospitalReq.status === 403, 'Patient is forbidden (403) from accessing hospital routes');

    // 8. Patient Smart Donor Match
    const smartMatch = await makeRequest('/api/patient/smart-match?locality=Sector%2016&bloodGroup=O-', 'GET', null, patientToken);
    assert(smartMatch.status === 200 && smartMatch.data.data.length > 0, 'Smart Donor Match returns matching hospitals and compatible donor counts');

    // 9. Patient creates new emergency request
    const hospitalList = await makeRequest('/api/patient/hospitals', 'GET', null, patientToken);
    const targetHospitalId = hospitalList.data.data[0]._id;

    const newReq = await makeRequest('/api/patient/requests', 'POST', {
      hospitalId: targetHospitalId,
      donationType: 'Blood',
      bloodGroup: 'O+',
      requiredUnits: 2,
      urgency: 'Critical',
      location: 'Ward 4B, Emergency Wing',
      locality: 'Sector 16',
      description: 'Urgent surgery requirement for trauma victim'
    }, patientToken);
    assert(newReq.status === 201 && newReq.data.data.status === 'Pending Review', 'Patient creates emergency request (Pending Review)');
    const createdReqId = newReq.data.data._id;

    // 10. Priority check: Critical urgency assigned High priority
    assert(newReq.data.data.priority === 'High', 'Deterministic triage assigned High priority for Critical urgency');

    // 11. Hospital retrieves assigned requests
    const hospRequests = await makeRequest('/api/hospital/requests', 'GET', null, hospitalToken);
    assert(hospRequests.status === 200 && hospRequests.data.data.some(r => r._id === createdReqId), 'Hospital retrieves assigned patient request');

    // 12. Hospital submits written review & response
    const reviewResponse = await makeRequest(`/api/hospital/requests/${createdReqId}/respond`, 'POST', {
      status: 'Reviewed — Response Sent',
      message: 'On-duty hematology team has reserved 2 units of O+ blood. Dispatch team notified.'
    }, hospitalToken);
    assert(reviewResponse.status === 200 && reviewResponse.data.data.status === 'Reviewed — Response Sent', 'Hospital submits written response and updates status');
    assert(reviewResponse.data.data.responses.length > 0, 'Response message persisted in responses history');

    // 13. Patient retrieves request and views the hospital response
    const patientViewReq = await makeRequest(`/api/patient/requests/${createdReqId}`, 'GET', null, patientToken);
    assert(patientViewReq.status === 200 && patientViewReq.data.data.responses.length > 0, 'Patient retrieves own request and sees persisted hospital response');

    // 14. In-App Notification check: Patient received notification
    const notifications = await makeRequest('/api/notifications', 'GET', null, patientToken);
    assert(notifications.status === 200 && notifications.data.data.length > 0, 'Patient received in-app notification of hospital response');

    // 15. Notification mark as read
    const notifId = notifications.data.data[0]._id;
    const markRead = await makeRequest(`/api/notifications/${notifId}/read`, 'PATCH', null, patientToken);
    assert(markRead.status === 200 && markRead.data.data.read === true, 'Patient marks notification as read');

    // 16. Hospital requires explanation when unable to proceed
    const invalidUnableToProceed = await makeRequest(`/api/hospital/requests/${createdReqId}/respond`, 'POST', {
      status: 'Unable to Proceed — Explanation Sent',
      message: 'No' // too short / no explanation
    }, hospitalToken);
    assert(invalidUnableToProceed.status === 400, 'Hospital must provide meaningful explanation when unable to proceed');

    // 17. Donor submits volunteer application
    const donorApp = await makeRequest('/api/donor/applications', 'POST', {
      hospitalId: targetHospitalId,
      donationType: 'Blood',
      donationCategory: 'Blood',
      bloodGroup: 'O+',
      requiredUnits: 1,
      preferredDonationDate: '2026-11-01',
      city: 'Chandigarh',
      contact: '9876543210',
      healthInformation: { weight: 65, hemoglobin: 14, smoker: 'No' }
    }, donorToken);
    assert(donorApp.status === 201 && donorApp.data.data.status === 'Pending Review', 'Donor submits application to target hospital');
    const donorAppId = donorApp.data.data._id;

    // 18. Hospital retrieves and decides on donor application separately
    const hospApps = await makeRequest('/api/hospital/applications', 'GET', null, hospitalToken);
    assert(hospApps.status === 200 && hospApps.data.data.some(a => a._id === donorAppId), 'Hospital retrieves separate donor applications queue');

    const appDecision = await makeRequest(`/api/hospital/applications/${donorAppId}/decision`, 'POST', {
      decision: 'Accepted',
      instructions: 'Please report to Blood Bank Room 102 at 10:00 AM on scheduled date.'
    }, hospitalToken);
    assert(appDecision.status === 200 && appDecision.data.data.status === 'Accepted', 'Hospital accepts donor application with instructions');

    // 19. Donor retrieves their own applications
    const donorApps = await makeRequest('/api/donor/applications', 'GET', null, donorToken);
    assert(donorApps.status === 200 && donorApps.data.data.some(a => a._id === donorAppId && a.status === 'Accepted'), 'Donor views accepted application status');

    // 20. Legacy in-memory endpoint returns 410 Gone
    const legacyCheck = await makeRequest('/api/requests', 'GET');
    assert(legacyCheck.status === 410, 'Legacy prototype /api/requests returns 410 Gone (no fake fallback)');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    if (server) {
      server.close(() => console.log('\n--- Test Server Stopped ---'));
    }
  }

  console.log(`\nTest Summary: ${passed} Passed, ${failed} Failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
