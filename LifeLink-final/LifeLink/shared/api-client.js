/**
 * ==============================================================================
 * LifeLink — Unified Frontend API Client
 * ==============================================================================
 * 
 * Provides authenticated, Promise-based HTTP methods for all LifeLink portals:
 * - Attaches JWT token from localStorage in Authorization: Bearer <token>
 * - Handles 401 Unauthorized / session expiration by redirecting to login
 * - Real error messages from backend, no silent fallback to fake data
 * - Exposes methods for Auth, Patient, Hospital, Donor, and Notifications
 * ==============================================================================
 */

const LifeLinkAPI = (function () {
  const API_BASE = '/api';
  const TOKEN_KEY = 'lifelink_auth_token';
  const USER_KEY = 'lifelink_auth_user';

  /**
   * Toast notification helper
   */
  function showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('lifelinkToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'lifelinkToastContainer';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `lifelink-toast ${type}`;

    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color: #059669;"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-circle-exclamation" style="color: #dc2626;"></i>';
    if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation" style="color: #d97706;"></i>';

    toast.innerHTML = `
      <div style="font-size: 18px; line-height: 1;">${icon}</div>
      <div style="flex: 1; line-height: 1.4;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Token & User Auth Management
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token, remember = true) {
    if (remember) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  function getUser() {
    try {
      const u = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  }

  function setUser(user, remember = true) {
    const json = JSON.stringify(user);
    if (remember) {
      localStorage.setItem(USER_KEY, json);
      sessionStorage.removeItem(USER_KEY);
    } else {
      sessionStorage.setItem(USER_KEY, json);
      localStorage.removeItem(USER_KEY);
    }
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    // Remove potential legacy or cross-session keys
    try {
      localStorage.removeItem('lifelink_token');
      localStorage.removeItem('lifelink_user');
      sessionStorage.removeItem('lifelink_token');
      sessionStorage.removeItem('lifelink_user');
    } catch (e) {}
  }

  function isAuthenticated() {
    return Boolean(getToken());
  }

  function getRole() {
    const user = getUser();
    return user ? user.role : null;
  }

  /**
   * Base Fetch wrapper with JWT injection & error handling
   */
  async function authFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const token = getToken();

    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, { ...options, headers });
      let data = null;

      try {
        data = await response.json();
      } catch (parseErr) {
        data = { message: await response.text() };
      }

      if (response.status === 401) {
        console.warn('[LifeLink Auth] Unauthorized (401). Session expired.');
        // Don't auto-redirect if already on login page
        if (!window.location.pathname.includes('login.html')) {
          clearAuth();
          showToast('Session expired. Please sign in again.', 'warning');
          setTimeout(() => {
            window.location.href = '../loginpage/login.html';
          }, 1500);
        }
        return { success: false, status: 401, message: data.message || 'Session expired.' };
      }

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          message: data.message || `Request failed with HTTP ${response.status}`,
          error: data.error
        };
      }

      return { success: true, status: response.status, ...data };
    } catch (networkError) {
      console.error('[LifeLink API] Network/Server Error:', networkError);
      return {
        success: false,
        status: 0,
        message: 'Unable to reach the server. Please verify your connection.'
      };
    }
  }

  /* =====================================================
   * 1. AUTHENTICATION API
   * ===================================================== */
  async function login(credentials) {
    clearAuth();
    const res = await authFetch('/auth/login', {
      method: 'POST',
      body: credentials
    });
    if (res.success && res.token) {
      setToken(res.token);
      setUser(res.user);
    }
    return res;
  }

  async function register(userData) {
    clearAuth();
    const res = await authFetch('/auth/register', {
      method: 'POST',
      body: userData
    });
    if (res.success && res.token) {
      setToken(res.token);
      setUser(res.user);
    }
    return res;
  }

  async function getMe() {
    return authFetch('/auth/me', { method: 'GET' });
  }

  function logout() {
    clearAuth();
    window.location.href = '../loginpage/login.html';
  }

  /* =====================================================
   * 2. PATIENT API
   * ===================================================== */
  async function getPatientRequests(status = '') {
    const query = status && status !== 'All' ? `?status=${encodeURIComponent(status)}` : '';
    return authFetch(`/patient/requests${query}`, { method: 'GET' });
  }

  async function getPatientRequestById(id) {
    return authFetch(`/patient/requests/${id}`, { method: 'GET' });
  }

  async function createPatientRequest(payload) {
    return authFetch('/patient/requests', {
      method: 'POST',
      body: payload
    });
  }

  async function getPatientHospitals() {
    return authFetch('/patient/hospitals', { method: 'GET' });
  }

  async function getSmartMatch(locality, bloodGroup, units = 1, urgency = 'Normal') {
    const params = new URLSearchParams({
      locality: locality || '',
      bloodGroup: bloodGroup || '',
      units: units || 1,
      urgency: urgency || 'Normal'
    });
    return authFetch(`/patient/smart-match?${params.toString()}`, { method: 'GET' });
  }

  async function getPatientProfile() {
    return authFetch('/patient/profile', { method: 'GET' });
  }

  async function updatePatientProfile(data) {
    return authFetch('/patient/profile', {
      method: 'PUT',
      body: data
    });
  }

  async function uploadPatientProfilePicture(formData) {
    return authFetch('/patient/profile/picture', {
      method: 'POST',
      body: formData
    });
  }

  /* =====================================================
   * 3. HOSPITAL API
   * ===================================================== */
  async function getHospitalRequests(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'All') params.append('status', filters.status);
    if (filters.urgency && filters.urgency !== 'All') params.append('urgency', filters.urgency);
    const q = params.toString() ? `?${params.toString()}` : '';
    return authFetch(`/hospital/requests${q}`, { method: 'GET' });
  }

  async function getHospitalRequestById(id) {
    return authFetch(`/hospital/requests/${id}`, { method: 'GET' });
  }

  async function respondToPatientRequest(id, payload) {
    return authFetch(`/hospital/requests/${id}/respond`, {
      method: 'POST',
      body: payload
    });
  }

  async function getHospitalApplications(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'All') params.append('status', filters.status);
    if (filters.category && filters.category !== 'All') params.append('category', filters.category);
    const q = params.toString() ? `?${params.toString()}` : '';
    return authFetch(`/hospital/applications${q}`, { method: 'GET' });
  }

  async function getHospitalApplicationById(id) {
    return authFetch(`/hospital/applications/${id}`, { method: 'GET' });
  }

  async function decideDonorApplication(id, payload) {
    return authFetch(`/hospital/applications/${id}/decision`, {
      method: 'POST',
      body: payload
    });
  }

  async function getHospitalProfile() {
    return authFetch('/hospital/profile', { method: 'GET' });
  }

  async function updateHospitalProfile(data) {
    return authFetch('/hospital/profile', {
      method: 'PUT',
      body: data
    });
  }

  async function getHospitalDonors() {
    return authFetch('/hospital/donors', { method: 'GET' });
  }

  /* =====================================================
   * 4. DONOR API
   * ===================================================== */
  async function submitDonorApplication(payload) {
    return authFetch('/donor/applications', {
      method: 'POST',
      body: payload
    });
  }

  async function getDonorApplications(status = '') {
    const q = status && status !== 'All' ? `?status=${encodeURIComponent(status)}` : '';
    return authFetch(`/donor/applications${q}`, { method: 'GET' });
  }

  async function getDonorApplicationById(id) {
    return authFetch(`/donor/applications/${id}`, { method: 'GET' });
  }

  async function getDonorProfile() {
    return authFetch('/donor/profile', { method: 'GET' });
  }

  async function updateDonorProfile(data) {
    return authFetch('/donor/profile', {
      method: 'PUT',
      body: data
    });
  }

  async function uploadDonorProfilePicture(formData) {
    return authFetch('/donor/profile/picture', {
      method: 'POST',
      body: formData
    });
  }

  async function getDonorHospitals() {
    return authFetch('/donor/hospitals', { method: 'GET' });
  }

  /* =====================================================
   * 5. NOTIFICATIONS API
   * ===================================================== */
  async function getNotifications(unreadOnly = false) {
    return authFetch(`/notifications${unreadOnly ? '?unreadOnly=true' : ''}`, { method: 'GET' });
  }

  async function markNotificationRead(id) {
    return authFetch(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  async function markAllNotificationsRead() {
    return authFetch('/notifications/read-all', { method: 'PATCH' });
  }

  /* =====================================================
   * 6. SYSTEM HEALTH
   * ===================================================== */
  async function checkServerHealth() {
    return authFetch('/health', { method: 'GET' });
  }

  // Public Interface
  return {
    showToast,
    getToken,
    setToken,
    getUser,
    setUser,
    clearAuth,
    isAuthenticated,
    getRole,
    authFetch,
    login,
    register,
    getMe,
    logout,
    // Patient
    getPatientRequests,
    getPatientRequestById,
    createPatientRequest,
    getPatientHospitals,
    getSmartMatch,
    getPatientProfile,
    updatePatientProfile,
    uploadPatientProfilePicture,
    // Hospital
    getHospitalRequests,
    getHospitalRequestById,
    respondToPatientRequest,
    getHospitalApplications,
    getHospitalApplicationById,
    decideDonorApplication,
    getHospitalProfile,
    updateHospitalProfile,
    getHospitalDonors,
    // Donor
    submitDonorApplication,
    getDonorApplications,
    getDonorApplicationById,
    getDonorProfile,
    updateDonorProfile,
    uploadDonorProfilePicture,
    getDonorHospitals,
    // Notifications
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    // System
    checkServerHealth
  };
})();

// Attach globally
window.LifeLinkAPI = LifeLinkAPI;
