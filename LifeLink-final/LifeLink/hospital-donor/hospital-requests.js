/**
 * ==============================================================================
 * LifeLink — Hospital Clinical Dashboard Controller
 * ==============================================================================
 * 
 * Features:
 * 1. Strict Hospital Authentication & Profile verification
 * 2. Separate Workflows: Emergency Patient Requests vs. Volunteer Donor Applications
 * 3. Transparent, deterministic rule-based priority triage display
 * 4. Clinical Review & Response with response message, explanation, and completion confirmation
 * 5. Full in-app notification dispatch via MongoDB backend
 * 6. Zero fake offline data fallback
 * ==============================================================================
 */

document.addEventListener("DOMContentLoaded", async function () {
    // 1. Session Verification
    if (!window.LifeLinkAPI || !window.LifeLinkAPI.isAuthenticated()) {
        const currentPath = window.location.pathname;
        window.location.href = `../loginpage/login.html?role=hospital&redirect=${encodeURIComponent(currentPath)}`;
        return;
    }

    const currentRole = window.LifeLinkAPI.getRole();
    if (currentRole !== "hospital") {
        window.LifeLinkAPI.showToast("Access restricted: Hospital clinical credentials required.", "error");
        setTimeout(() => {
            window.location.href = "../loginpage/login.html?role=hospital";
        }, 1200);
        return;
    }

    // 2. State & Cache
    let activeWorkflow = "patient_requests"; // "patient_requests" | "donor_applications"
    let currentFilter = "All";
    let cachedPatientRequests = [];
    let cachedDonorApplications = [];
    let hospitalProfile = null;

    // DOM References
    const registeredHospitalNameEl = document.getElementById("registeredHospitalName");
    const hospitalSignOutBtn = document.getElementById("hospitalSignOutBtn");
    const tabPatientRequests = document.getElementById("tabPatientRequests");
    const tabDonorApplications = document.getElementById("tabDonorApplications");
    const patientRequestsCountBadge = document.getElementById("patientRequestsCountBadge");
    const donorApplicationsCountBadge = document.getElementById("donorApplicationsCountBadge");
    const requestsList = document.getElementById("requestsList");
    const filterInfoText = document.getElementById("filterInfoText");

    // Metrics
    const totalCountEl = document.getElementById("totalCount");
    const pendingCountEl = document.getElementById("pendingCount");
    const acceptedCountEl = document.getElementById("acceptedCount");
    const rejectedCountEl = document.getElementById("rejectedCount");

    // Modals
    const patientResponseModal = document.getElementById("patientResponseModal");
    const closePatientResponseModal = document.getElementById("closePatientResponseModal");
    const cancelPatientResponseModal = document.getElementById("cancelPatientResponseModal");
    const patientResponseForm = document.getElementById("patientResponseForm");
    const modalResponseStatus = document.getElementById("modalResponseStatus");
    const modalResponseMessage = document.getElementById("modalResponseMessage");
    const modalRequestId = document.getElementById("modalRequestId");
    const modalPatientSummary = document.getElementById("modalPatientSummary");
    const explanationGroup = document.getElementById("explanationGroup");
    const modalExplanationReason = document.getElementById("modalExplanationReason");
    const completionConfirmGroup = document.getElementById("completionConfirmGroup");
    const modalCompletionConfirm = document.getElementById("modalCompletionConfirm");

    const donorDecisionModal = document.getElementById("donorDecisionModal");
    const closeDonorDecisionModal = document.getElementById("closeDonorDecisionModal");
    const cancelDonorDecisionModal = document.getElementById("cancelDonorDecisionModal");
    const donorDecisionForm = document.getElementById("donorDecisionForm");
    const modalApplicationId = document.getElementById("modalApplicationId");
    const modalDonorSummary = document.getElementById("modalDonorSummary");
    const modalDecisionStatus = document.getElementById("modalDecisionStatus");
    const donorExplanationGroup = document.getElementById("donorExplanationGroup");
    const modalDonorExplanation = document.getElementById("modalDonorExplanation");
    const modalDonorInstructions = document.getElementById("modalDonorInstructions");

    // Sign Out Handler
    if (hospitalSignOutBtn) {
        hospitalSignOutBtn.addEventListener("click", () => window.LifeLinkAPI.logout());
    }

    // Modal Status Change Listeners
    if (modalResponseStatus) {
        modalResponseStatus.addEventListener("change", function () {
            const val = this.value;
            if (explanationGroup) {
                explanationGroup.style.display = (val === "Unable to Proceed — Explanation Sent") ? "block" : "none";
            }
            if (completionConfirmGroup) {
                completionConfirmGroup.style.display = (val === "Completed") ? "block" : "none";
            }
        });
    }

    if (modalDecisionStatus) {
        modalDecisionStatus.addEventListener("change", function () {
            if (donorExplanationGroup) {
                donorExplanationGroup.style.display = (this.value === "Rejected") ? "block" : "none";
            }
        });
    }

    // Modal Close buttons
    [closePatientResponseModal, cancelPatientResponseModal].forEach(btn => {
        if (btn) btn.addEventListener("click", () => patientResponseModal.classList.remove("active"));
    });

    [closeDonorDecisionModal, cancelDonorDecisionModal].forEach(btn => {
        if (btn) btn.addEventListener("click", () => donorDecisionModal.classList.remove("active"));
    });

    // Workflow Tabs
    if (tabPatientRequests) {
        tabPatientRequests.addEventListener("click", () => {
            activeWorkflow = "patient_requests";
            tabPatientRequests.classList.add("active");
            tabDonorApplications.classList.remove("active");
            currentFilter = "All";
            updateFilterButtons();
            renderActiveList();
        });
    }

    if (tabDonorApplications) {
        tabDonorApplications.addEventListener("click", () => {
            activeWorkflow = "donor_applications";
            tabDonorApplications.classList.add("active");
            tabPatientRequests.classList.remove("active");
            currentFilter = "All";
            updateFilterButtons();
            renderActiveList();
        });
    }

    // Filter Buttons
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            currentFilter = this.getAttribute("data-filter") || "All";
            renderActiveList();
        });
    });

    function updateFilterButtons() {
        document.querySelectorAll(".filter-btn").forEach((b, idx) => {
            b.classList.toggle("active", idx === 0);
        });
    }

    // 3. Load Hospital Profile & Data
    async function initDashboard() {
        try {
            requestsList.innerHTML = `
                <div style="text-align:center; padding:40px; color:#64748B;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size:28px; margin-bottom:12px; color:#871622;"></i>
                    <p>Loading assigned records from secure clinical network...</p>
                </div>
            `;

            const profileRes = await window.LifeLinkAPI.getHospitalProfile();
            if (profileRes.success && profileRes.data) {
                hospitalProfile = profileRes.data;
                if (registeredHospitalNameEl) {
                    registeredHospitalNameEl.textContent = hospitalProfile.hospitalName || "Accredited Facility";
                }
            }

            await reloadAllData();
        } catch (err) {
            console.error("Dashboard init error:", err);
            requestsList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-circle-exclamation empty-icon" style="color:#DC2626;"></i>
                    <h3>Unable to load clinical records</h3>
                    <p>Please check your database connectivity or refresh your session.</p>
                </div>
            `;
        }
    }

    async function reloadAllData() {
        const [patientRes, donorRes] = await Promise.all([
            window.LifeLinkAPI.getHospitalRequests(),
            window.LifeLinkAPI.getHospitalApplications()
        ]);

        if (patientRes.success) {
            cachedPatientRequests = patientRes.data || [];
            if (patientRequestsCountBadge) patientRequestsCountBadge.textContent = cachedPatientRequests.length;
        } else {
            console.error("Patient requests fetch error:", patientRes.message);
            window.LifeLinkAPI.showToast("Failed to fetch emergency requests: " + (patientRes.message || "Server error"), "error");
        }

        if (donorRes.success) {
            cachedDonorApplications = donorRes.data || [];
            if (donorApplicationsCountBadge) donorApplicationsCountBadge.textContent = cachedDonorApplications.length;
        } else {
            console.error("Donor applications fetch error:", donorRes.message);
        }

        updateMetrics();
        renderActiveList();
    }

    // 4. Update Summary Metrics
    function updateMetrics() {
        const activeData = (activeWorkflow === "patient_requests") ? cachedPatientRequests : cachedDonorApplications;
        if (totalCountEl) totalCountEl.textContent = activeData.length;

        if (activeWorkflow === "patient_requests") {
            const pending = cachedPatientRequests.filter(r => r.status === "Pending Review" || r.status === "Under Review").length;
            const reviewed = cachedPatientRequests.filter(r => r.status === "Reviewed — Response Sent" || r.status === "Completed").length;
            const actionReq = cachedPatientRequests.filter(r => r.status === "More Information Required" || r.status === "Unable to Proceed — Explanation Sent").length;

            if (pendingCountEl) pendingCountEl.textContent = pending;
            if (acceptedCountEl) acceptedCountEl.textContent = reviewed;
            if (rejectedCountEl) rejectedCountEl.textContent = actionReq;
        } else {
            const pending = cachedDonorApplications.filter(a => a.status === "Pending Review" || a.status === "Under Review").length;
            const accepted = cachedDonorApplications.filter(a => a.status === "Accepted").length;
            const declined = cachedDonorApplications.filter(a => a.status === "Rejected" || a.status === "More Information Required").length;

            if (pendingCountEl) pendingCountEl.textContent = pending;
            if (acceptedCountEl) acceptedCountEl.textContent = accepted;
            if (rejectedCountEl) rejectedCountEl.textContent = declined;
        }
    }

    // 5. Render Active List
    function renderActiveList() {
        updateMetrics();
        if (activeWorkflow === "patient_requests") {
            renderPatientRequests();
        } else {
            renderDonorApplications();
        }
    }

    // Helper to normalize status strings across Unicode em-dash, en-dash and hyphen
    function normalizeStatus(s) {
        return (s || "").replace(/[\u2014\u2013-]/g, '-').replace(/\s+/g, ' ').toLowerCase().trim();
    }

    // Render Emergency Patient Requests
    function renderPatientRequests() {
        let items = cachedPatientRequests;

        if (currentFilter !== "All") {
            items = items.filter(i => normalizeStatus(i.status) === normalizeStatus(currentFilter));
        }

        if (filterInfoText) {
            filterInfoText.textContent = `Showing ${items.length} of ${cachedPatientRequests.length} emergency patient requests`;
        }

        if (items.length === 0) {
            requestsList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-inbox empty-icon"></i>
                    <h3>No patient emergency requests found</h3>
                    <p>There are no emergency patient requests matching the selected status filter.</p>
                </div>
            `;
            return;
        }

        requestsList.innerHTML = items.map(req => {
            const priorityClass = req.priority === "High" ? "priority-badge-high" : (req.priority === "Medium" ? "priority-badge-medium" : "priority-badge-low");
            const responsesHtml = (req.responses && req.responses.length > 0) ? `
                <div class="response-history-box">
                    <div class="response-history-title"><i class="fa-solid fa-clock-rotate-left"></i> Clinical Response History (${req.responses.length})</div>
                    ${req.responses.map(resp => `
                        <div class="response-entry">
                            <div class="response-meta"><strong>${resp.senderName || "Hospital Staff"}</strong> • ${new Date(resp.timestamp).toLocaleString()} • <em>${resp.statusAtResponse || "Update"}</em></div>
                            <div>${resp.message}</div>
                        </div>
                    `).join('')}
                </div>
            ` : '';

            return `
                <div class="request-card" data-id="${req._id}">
                    <div class="card-header">
                        <div>
                            <div class="patient-title-row" style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                                <h3 style="font-size:17px; font-weight:700; color:#0F172A;">${req.patientName || "Emergency Patient"}</h3>
                                <span class="${priorityClass}"><i class="fa-solid fa-shield-halved"></i> ${req.priority || "Medium"} Priority</span>
                                <span class="status-badge" style="font-size:11px;">${req.status}</span>
                            </div>
                            <div style="font-size:12px; color:#64748B;">
                                <span><i class="fa-regular fa-clock"></i> Submitted: ${new Date(req.createdAt).toLocaleString()}</span>
                                <span style="margin-left:12px;"><i class="fa-solid fa-hourglass-start"></i> Waiting: ${req.hoursWaiting || 0}h</span>
                            </div>
                        </div>
                        <div class="card-actions">
                            <button type="button" class="action-btn accept btn-respond-patient" data-id="${req._id}" style="background:#871622; color:#FFF; border:none; padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer;">
                                <i class="fa-solid fa-reply"></i> Review & Respond
                            </button>
                        </div>
                    </div>

                    <div style="background:#FFF1F2; border-left:3px solid #E11D48; padding:8px 12px; border-radius:4px; font-size:12px; color:#9F1239; margin:12px 0;">
                        <strong>Triage Evaluation:</strong> ${req.priorityReason || "Deterministic urgency classification."}
                    </div>

                    <div class="details-grid">
                        <div class="detail-item">
                            <span class="detail-label">Donation Requirement</span>
                            <span class="detail-value" style="font-weight:700; color:#871622;">${req.donationType} ${req.bloodGroup ? '(' + req.bloodGroup + ')' : (req.organRequired ? '(' + req.organRequired + ')' : '')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Required Units</span>
                            <span class="detail-value">${req.requiredUnits || 1} Unit(s)</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Urgency Tier</span>
                            <span class="detail-value" style="font-weight:600;">${req.urgency || "Normal"}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Patient Ward / Location</span>
                            <span class="detail-value">${req.location || "Hospital Ward"}</span>
                        </div>
                        <div class="detail-item" style="grid-column: 1 / -1;">
                            <span class="detail-label">Clinical Need Description</span>
                            <span class="detail-value">${req.description || "No specific details provided."}</span>
                        </div>
                    </div>

                    ${responsesHtml}
                </div>
            `;
        }).join('');

        // Attach Respond Listeners
        document.querySelectorAll(".btn-respond-patient").forEach(btn => {
            btn.addEventListener("click", function () {
                const reqId = this.getAttribute("data-id");
                openPatientResponseModal(reqId);
            });
        });
    }

    // Render Volunteer Donor Applications
    function renderDonorApplications() {
        let items = cachedDonorApplications;

        if (currentFilter !== "All") {
            items = items.filter(i => normalizeStatus(i.status) === normalizeStatus(currentFilter));
        }

        if (filterInfoText) {
            filterInfoText.textContent = `Showing ${items.length} of ${cachedDonorApplications.length} donor applications`;
        }

        if (items.length === 0) {
            requestsList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-hand-holding-heart empty-icon"></i>
                    <h3>No donor applications found</h3>
                    <p>There are no volunteer donor applications matching the selected status filter.</p>
                </div>
            `;
            return;
        }

        requestsList.innerHTML = items.map(app => {
            const hInfo = app.healthInformation || {};
            const decisionHtml = app.hospitalDecision && app.hospitalDecision.decision ? `
                <div class="response-history-box" style="background:#F0FDF4; border-color:#BBF7D0;">
                    <div class="response-history-title" style="color:#166534;"><i class="fa-solid fa-check-circle"></i> Hospital Determination: ${app.hospitalDecision.decision}</div>
                    <div style="font-size:13px; color:#14532D;">
                        ${app.hospitalDecision.instructions ? `<p><strong>Instructions:</strong> ${app.hospitalDecision.instructions}</p>` : ''}
                        ${app.hospitalDecision.explanation ? `<p><strong>Explanation:</strong> ${app.hospitalDecision.explanation}</p>` : ''}
                        <small style="color:#15803D;">Decided on ${new Date(app.hospitalDecision.decidedAt).toLocaleString()}</small>
                    </div>
                </div>
            ` : '';

            return `
                <div class="request-card" data-id="${app._id}">
                    <div class="card-header">
                        <div>
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                                <h3 style="font-size:17px; font-weight:700; color:#0F172A;">${app.donorName}</h3>
                                <span class="status-badge" style="font-size:11px;">${app.status}</span>
                            </div>
                            <div style="font-size:12px; color:#64748B;">
                                <span><i class="fa-regular fa-clock"></i> Pledge Date: ${new Date(app.createdAt).toLocaleDateString()}</span>
                                <span style="margin-left:12px;"><i class="fa-solid fa-location-dot"></i> ${app.city || 'Punjab'}</span>
                            </div>
                        </div>
                        <div class="card-actions">
                            <button type="button" class="action-btn accept btn-decide-donor" data-id="${app._id}" style="background:#0F172A; color:#FFF; border:none; padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer;">
                                <i class="fa-solid fa-gavel"></i> Clinical Decision
                            </button>
                        </div>
                    </div>

                    <div class="details-grid">
                        <div class="detail-item">
                            <span class="detail-label">Pledge Type</span>
                            <span class="detail-value" style="font-weight:700; color:#871622;">${app.donationType} (${app.bloodGroup || 'Blood'})</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Donor Demographics</span>
                            <span class="detail-value">${app.donorAge || '—'} yrs • ${app.gender || '—'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Preferred Date</span>
                            <span class="detail-value">${app.preferredDonationDate || 'Immediate'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Donor Contact</span>
                            <span class="detail-value">${app.donorContact || 'Confidential'}</span>
                        </div>
                        <div class="detail-item" style="grid-column: 1 / -1; background:#F8FAFC; padding:8px 12px; border-radius:6px;">
                            <span class="detail-label">Self-Reported Health Screening</span>
                            <span class="detail-value" style="font-size:12px; color:#334155;">
                                Weight: <strong>${hInfo.weight || '—'} kg</strong> |
                                Hb: <strong>${hInfo.hemoglobin || '—'} g/dL</strong> |
                                BP: <strong>${hInfo.bloodPressure || '—'}</strong> |
                                Chronic Disease: <strong>${hInfo.chronicDisease || 'No'}</strong> |
                                Smoker: <strong>${hInfo.smoker || 'No'}</strong>
                            </span>
                        </div>
                    </div>

                    ${decisionHtml}
                </div>
            `;
        }).join('');

        // Attach Decision Listeners
        document.querySelectorAll(".btn-decide-donor").forEach(btn => {
            btn.addEventListener("click", function () {
                const appId = this.getAttribute("data-id");
                openDonorDecisionModal(appId);
            });
        });
    }

    // 6. Open Response Modal (Patient Request)
    function openPatientResponseModal(id) {
        const req = cachedPatientRequests.find(r => r._id === id);
        if (!req) return;

        modalRequestId.value = id;
        modalResponseStatus.value = "Reviewed — Response Sent";
        modalResponseMessage.value = "";
        modalExplanationReason.value = "";
        modalCompletionConfirm.checked = false;

        if (explanationGroup) explanationGroup.style.display = "none";
        if (completionConfirmGroup) completionConfirmGroup.style.display = "none";

        modalPatientSummary.innerHTML = `
            <strong>Patient:</strong> ${req.patientName} &bull;
            <strong>Requirement:</strong> ${req.donationType} ${req.bloodGroup ? '(' + req.bloodGroup + ')' : ''} &bull;
            <strong>Units:</strong> ${req.requiredUnits || 1}<br>
            <strong>Urgency:</strong> ${req.urgency} &bull; <strong>Triage Priority:</strong> ${req.priority}<br>
            <strong>Current Status:</strong> <span style="font-weight:600;">${req.status}</span>
        `;

        patientResponseModal.classList.add("active");
    }

    // Submit Response Handler
    if (patientResponseForm) {
        patientResponseForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            const id = modalRequestId.value;
            const status = modalResponseStatus.value;
            const message = modalResponseMessage.value.trim();
            const reason = modalExplanationReason.value.trim();
            const actualCompletionConfirmed = modalCompletionConfirm.checked;

            if (!message || message.length < 5) {
                window.LifeLinkAPI.showToast("Please enter a meaningful response message (at least 5 characters).", "warning");
                return;
            }

            if (status === "Unable to Proceed — Explanation Sent" && !reason) {
                window.LifeLinkAPI.showToast("A clear explanation is required when the request cannot proceed.", "warning");
                return;
            }

            if (status === "Completed" && !actualCompletionConfirmed) {
                window.LifeLinkAPI.showToast("Please confirm that the medical donation has been completed.", "warning");
                return;
            }

            const submitBtn = document.getElementById("submitPatientResponseBtn");
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
            }

            try {
                const res = await window.LifeLinkAPI.respondToPatientRequest(id, {
                    status,
                    message,
                    reason,
                    actualCompletionConfirmed
                });

                if (res.success) {
                    window.LifeLinkAPI.showToast(`Clinical response saved. Status updated to "${status}".`, "success");
                    patientResponseModal.classList.remove("active");
                    await reloadAllData();
                } else {
                    window.LifeLinkAPI.showToast(res.message || "Failed to submit response.", "error");
                }
            } catch (err) {
                console.error("Submit response error:", err);
                window.LifeLinkAPI.showToast("Server error while submitting response.", "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Response';
                }
            }
        });
    }

    // 7. Open Donor Decision Modal
    function openDonorDecisionModal(id) {
        const app = cachedDonorApplications.find(a => a._id === id);
        if (!app) return;

        modalApplicationId.value = id;
        modalDecisionStatus.value = "Accepted";
        modalDonorInstructions.value = "";
        modalDonorExplanation.value = "";
        if (donorExplanationGroup) donorExplanationGroup.style.display = "none";

        modalDonorSummary.innerHTML = `
            <strong>Donor:</strong> ${app.donorName} &bull;
            <strong>Pledge:</strong> ${app.donationType} (${app.bloodGroup || 'Blood'})<br>
            <strong>Contact:</strong> ${app.donorContact || 'Confidential'} &bull;
            <strong>Age:</strong> ${app.donorAge || '—'} yrs<br>
            <strong>Current Status:</strong> <span style="font-weight:600;">${app.status}</span>
        `;

        donorDecisionModal.classList.add("active");
    }

    // Submit Donor Decision Handler
    if (donorDecisionForm) {
        donorDecisionForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            const id = modalApplicationId.value;
            const decision = modalDecisionStatus.value;
            const explanation = modalDonorExplanation.value.trim();
            const instructions = modalDonorInstructions.value.trim();

            if (decision === "Rejected" && (!explanation || explanation.length < 5)) {
                window.LifeLinkAPI.showToast("A clinical explanation is required when declining an application.", "warning");
                return;
            }

            const submitBtn = document.getElementById("submitDonorDecisionBtn");
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            }

            try {
                const res = await window.LifeLinkAPI.decideDonorApplication(id, {
                    decision,
                    explanation,
                    instructions
                });

                if (res.success) {
                    window.LifeLinkAPI.showToast(`Donor application updated to "${decision}".`, "success");
                    donorDecisionModal.classList.remove("active");
                    await reloadAllData();
                } else {
                    window.LifeLinkAPI.showToast(res.message || "Failed to save decision.", "error");
                }
            } catch (err) {
                console.error("Decision error:", err);
                window.LifeLinkAPI.showToast("Server error while saving decision.", "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Decision';
                }
            }
        });
    }

    // Initialize
    await initDashboard();
});
