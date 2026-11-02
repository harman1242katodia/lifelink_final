/**
 * ==============================================================================
 * LifeLink — Patient Module Controller
 * ==============================================================================
 * 
 * Manages all patient functions:
 * 1. Authentication & profile verification (Patient role only)
 * 2. Location-Based Smart Donor Match (Proximity & ABO Compatibility)
 * 3. Emergency Request submission to verified hospital network
 * 4. Tracking request status history and written hospital responses
 * 5. In-app notifications
 * ==============================================================================
 */

document.addEventListener("DOMContentLoaded", async function () {
    // 1. Session Verification
    if (!window.LifeLinkAPI || !window.LifeLinkAPI.isAuthenticated()) {
        const currentPath = window.location.pathname;
        window.location.href = `../loginpage/login.html?role=patient&redirect=${encodeURIComponent(currentPath)}`;
        return;
    }

    const currentRole = window.LifeLinkAPI.getRole();
    if (currentRole !== "patient") {
        window.LifeLinkAPI.showToast("Access restricted: Patient account required.", "error");
        setTimeout(() => {
            window.location.href = "../loginpage/login.html?role=patient";
        }, 1200);
        return;
    }

    const user = window.LifeLinkAPI.getUser() || {};
    let patientProfile = null;

    // Helper to update all avatar containers with image
    function updateAvatarDisplays(pictureUrl) {
        if (!pictureUrl) return;
        const urlWithCacheBuster = pictureUrl.startsWith('data:') ? pictureUrl : `${pictureUrl}?t=${Date.now()}`;
        document.querySelectorAll(".patient-avatar").forEach(av => {
            av.innerHTML = `<img src="${urlWithCacheBuster}" alt="Patient Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        });
        const mainImg = document.getElementById("patientProfileImg");
        const defaultIcon = document.getElementById("patientProfileDefaultIcon");
        if (mainImg) {
            mainImg.src = urlWithCacheBuster;
            mainImg.style.display = "block";
            if (defaultIcon) defaultIcon.style.display = "none";
        }
    }

    // Display Name in header
    document.querySelectorAll("#displayPatientName, #patientName, #profileTitleName").forEach(el => {
        if (el) el.textContent = user.name || "Verified Patient";
    });

    // Logout Handler
    document.querySelectorAll(".logout-btn, #patientLogoutBtn").forEach(btn => {
        btn.addEventListener("click", () => window.LifeLinkAPI.logout());
    });

    // URL inspection
    const isProfilePage = window.location.pathname.endsWith("patient-profile.html");
    const urlParams = new URLSearchParams(window.location.search);
    const isOnboarding = urlParams.get("onboarding") === "true";

    // Helper to safely render text or 'Not provided'
    function renderField(elementId, value, fallback = "Not provided") {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            el.textContent = value;
            el.classList.remove("not-provided");
        } else {
            el.innerHTML = `<span class="not-provided">${fallback}</span>`;
        }
    }

    // Helper to populate form input fields
    function setInputValue(id, val) {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) {
            el.value = val;
        }
    }

    // Helper to update profile UI view elements
    function populateProfileView(p) {
        renderField("patientName", p.name || user.name);
        renderField("patientEmail", p.email || user.email);
        renderField("patientPhone", p.phone || user.phone);
        renderField("patientAge", p.age ? `${p.age} Years` : null);
        renderField("patientGender", p.gender);
        renderField("patientBloodGroup", p.bloodGroup ? `${p.bloodGroup}` : null, "Not specified");
        renderField("patientAddress", p.address);

        const locationParts = [p.locality, p.city, p.state, p.pincode].filter(Boolean);
        renderField("patientCityState", locationParts.length > 0 ? locationParts.join(", ") : null);

        const em = p.emergencyContact || {};
        renderField("patientEmergencyName", em.name);
        renderField("emergencyContact", em.phone);
        renderField("contactRelationship", em.relationship);

        renderField("medicalCondition", p.medicalCondition, "None reported");
        renderField("organRequirement", p.organRequirement, "None");

        // Profile Card Header
        const titleName = document.getElementById("profileTitleName");
        if (titleName) titleName.textContent = p.name || user.name || "Verified Patient";

        // Status Badge
        const statusBadge = document.getElementById("profileStatusBadge");
        if (statusBadge) {
            if (p.isProfileComplete) {
                statusBadge.className = "badge-complete";
                statusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Complete & Verified';
            } else {
                statusBadge.className = "badge-incomplete";
                statusBadge.innerHTML = '<i class="fa-solid fa-clock"></i> Incomplete Profile';
            }
        }
    }

    // Helper to populate profile edit form
    function populateProfileForm(p) {
        setInputValue("profileName", p.name || user.name || "");
        setInputValue("profileEmail", p.email || user.email || "");
        setInputValue("profilePhone", p.phone || user.phone || "");
        setInputValue("profileAge", p.age || "");
        setInputValue("profileGender", p.gender || "");
        setInputValue("profileBloodGroup", p.bloodGroup || "");
        setInputValue("profileAddress", p.address || "");
        setInputValue("profileLocality", p.locality || "");
        setInputValue("profileCity", p.city || "");
        setInputValue("profileState", p.state || "");
        setInputValue("profilePincode", p.pincode || "");

        const em = p.emergencyContact || {};
        setInputValue("profileEmergencyName", em.name || "");
        setInputValue("profileEmergencyPhone", em.phone || "");
        setInputValue("profileEmergencyRel", em.relationship || "");

        setInputValue("profileMedicalCondition", p.medicalCondition || "");
        setInputValue("profileOrganRequirement", p.organRequirement || "");
    }

    // 2. Load Patient Profile
    try {
        const profileRes = await window.LifeLinkAPI.getPatientProfile();
        if (profileRes.success && profileRes.data) {
            patientProfile = profileRes.data;

            if (patientProfile.name) {
                document.querySelectorAll("#displayPatientName, #patientName, #profileTitleName").forEach(el => {
                    if (el) el.textContent = patientProfile.name;
                });
            }

            // Display profile picture across all patient portal pages
            if (patientProfile.profilePicture) {
                updateAvatarDisplays(patientProfile.profilePicture);
            }

            // Handle Profile Page View/Edit State
            if (isProfilePage) {
                populateProfileView(patientProfile);
                populateProfileForm(patientProfile);

                // Setup profile photo upload handler
                const photoInput = document.getElementById("patientPhotoInput");
                if (photoInput) {
                    photoInput.addEventListener("change", async function () {
                        if (!this.files || !this.files[0]) return;
                        const file = this.files[0];
                        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
                        if (!validTypes.includes(file.type.toLowerCase())) {
                            window.LifeLinkAPI.showToast("Invalid file format. Only JPG, JPEG, PNG, and WEBP formats are allowed.", "error");
                            this.value = "";
                            return;
                        }
                        if (file.size > 2 * 1024 * 1024) {
                            window.LifeLinkAPI.showToast("Image exceeds maximum allowed size of 2 MB.", "error");
                            this.value = "";
                            return;
                        }

                        // Preview immediately with FileReader
                        const reader = new FileReader();
                        reader.onload = e => updateAvatarDisplays(e.target.result);
                        reader.readAsDataURL(file);

                        window.LifeLinkAPI.showToast("Uploading profile picture...", "info", 2000);
                        const formData = new FormData();
                        formData.append("profilePicture", file);

                        try {
                            const uploadRes = await window.LifeLinkAPI.uploadPatientProfilePicture(formData);
                            if (uploadRes.success && uploadRes.profilePicture) {
                                patientProfile.profilePicture = uploadRes.profilePicture;
                                updateAvatarDisplays(uploadRes.profilePicture);
                                window.LifeLinkAPI.showToast("Profile picture updated successfully!", "success");
                            } else {
                                window.LifeLinkAPI.showToast(uploadRes.message || "Failed to upload image.", "error");
                                if (patientProfile && patientProfile.profilePicture) {
                                    updateAvatarDisplays(patientProfile.profilePicture);
                                }
                            }
                        } catch (err) {
                            console.error("Upload error:", err);
                            window.LifeLinkAPI.showToast("Network error uploading image.", "error");
                        } finally {
                            photoInput.value = "";
                        }
                    });
                }

                const viewContainer = document.getElementById("profileViewContainer");
                const editContainer = document.getElementById("profileEditContainer");
                const onboardingBanner = document.getElementById("onboardingBanner");
                const editBtn = document.getElementById("editProfileBtn");
                const cancelBtn = document.getElementById("cancelEditBtn");
                const formSectionTitle = document.getElementById("formSectionTitle");

                // Toggle into Edit/Onboarding Mode if incomplete or onboarding parameter present
                if (!patientProfile.isProfileComplete || isOnboarding) {
                    if (onboardingBanner) onboardingBanner.style.display = "block";
                    if (viewContainer) viewContainer.style.display = "none";
                    if (editContainer) editContainer.style.display = "block";
                    if (formSectionTitle) formSectionTitle.textContent = "Complete Your Patient Profile";
                    if (cancelBtn) {
                        // If profile is incomplete, cancel is hidden to ensure onboarding is completed
                        cancelBtn.style.display = patientProfile.isProfileComplete ? "inline-block" : "none";
                    }
                } else {
                    if (onboardingBanner) onboardingBanner.style.display = "none";
                    if (viewContainer) viewContainer.style.display = "block";
                    if (editContainer) editContainer.style.display = "none";
                    if (cancelBtn) cancelBtn.style.display = "inline-block";
                }

                if (editBtn && viewContainer && editContainer) {
                    editBtn.addEventListener("click", () => {
                        viewContainer.style.display = "none";
                        editContainer.style.display = "block";
                        if (formSectionTitle) formSectionTitle.textContent = "Edit Patient Profile";
                    });
                }

                if (cancelBtn && viewContainer && editContainer) {
                    cancelBtn.addEventListener("click", () => {
                        editContainer.style.display = "none";
                        viewContainer.style.display = "block";
                    });
                }
            }

            // Onboarding Warning Banner on other patient pages
            if (!patientProfile.isProfileComplete && !isProfilePage) {
                const notifsBanner = document.getElementById("patientNotifsBanner");
                const notifsText = document.getElementById("patientNotifsText");
                if (notifsBanner && notifsText) {
                    notifsBanner.style.display = "flex";
                    notifsBanner.style.background = "#FFFBEB";
                    notifsBanner.style.borderColor = "#FDE68A";
                    notifsText.innerHTML = `⚠️ <strong>Action Required:</strong> Your patient profile is incomplete. <a href="patient-profile.html?onboarding=true" style="color:#B45309; text-decoration:underline; font-weight:700;">Complete your profile</a> to ensure proper hospital emergency triage.`;
                }
            }

            // Pre-fill Smart Match inputs if on dashboard
            const matchLocality = document.getElementById("matchLocality");
            const matchBloodGroup = document.getElementById("matchBloodGroup");
            if (matchLocality && patientProfile.locality) {
                matchLocality.value = patientProfile.locality;
            }
            if (matchBloodGroup && patientProfile.bloodGroup) {
                matchBloodGroup.value = patientProfile.bloodGroup;
            }
        }
    } catch (e) {
        console.warn("Could not load patient profile:", e);
    }

    // 3. Check Notifications
    try {
        const notifsRes = await window.LifeLinkAPI.getNotifications(true);
        if (notifsRes.success && notifsRes.unreadCount > 0) {
            const notifsBanner = document.getElementById("patientNotifsBanner");
            const notifsText = document.getElementById("patientNotifsText");
            if (notifsBanner && notifsText) {
                notifsText.innerHTML = `You have <strong>${notifsRes.unreadCount}</strong> new hospital response(s) or status update(s).`;
                notifsBanner.style.display = "flex";
            }
        }
    } catch (e) {
        console.warn("Could not load notifications:", e);
    }

    // ==============================================================================
    // 4. SMART DONOR MATCH HANDLER (Patient Dashboard)
    // ==============================================================================
    const smartMatchForm = document.getElementById("smartMatchForm");
    const smartMatchResultsContainer = document.getElementById("smartMatchResultsContainer");

    if (smartMatchForm) {
        smartMatchForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            const locality = document.getElementById("matchLocality")?.value.trim() || "";
            const bloodGroup = document.getElementById("matchBloodGroup")?.value.trim() || "";
            const units = Number(document.getElementById("matchUnits")?.value) || 1;

            if (!locality) {
                window.LifeLinkAPI.showToast("Please provide your locality or sector.", "warning");
                return;
            }

            const searchBtn = document.getElementById("btnSmartSearch");
            if (searchBtn) {
                searchBtn.disabled = true;
                searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';
            }

            smartMatchResultsContainer.innerHTML = `
                <div style="text-align:center; padding:30px; color:#64748B;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px; color:#871622; margin-bottom:8px; display:block;"></i>
                    Scanning verified hospital network & compatible active donors...
                </div>
            `;

            try {
                const res = await window.LifeLinkAPI.getSmartMatch(locality, bloodGroup, units);

                if (!res.success || !res.data || res.data.length === 0) {
                    smartMatchResultsContainer.innerHTML = `
                        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:20px; text-align:center;">
                            <i class="fa-solid fa-circle-info" style="font-size:24px; color:#D97706; margin-bottom:8px;"></i>
                            <h4 style="font-size:15px; color:#0F172A; margin-bottom:4px;">No immediate hospital matches found</h4>
                            <p style="font-size:13px; color:#64748B;">No nearby medical centers in "${locality}" with reported stock. You can still raise an emergency request to any hospital.</p>
                        </div>
                    `;
                    return;
                }

                smartMatchResultsContainer.innerHTML = `
                    <div style="font-size:13px; color:#475569; margin-bottom:12px;">
                        Found <strong>${res.data.length}</strong> hospital facility match(es) for <strong>${bloodGroup}</strong> in/near "${locality}".
                        Compatible donor groups: <em>${res.compatibleGroups.join(', ')}</em>.
                    </div>
                    <div class="match-results-grid">
                        ${res.data.map(h => {
                            const stockUnits = h.reportedBloodStock ? h.reportedBloodStock.availableUnits : 0;
                            const distanceLabel = h.distanceLabel || 'Regional Network';
                            const reqLink = `emergency-request.html?hospitalId=${h.hospitalId}&hospitalName=${encodeURIComponent(h.hospitalName)}&bloodGroup=${encodeURIComponent(bloodGroup)}`;

                            return `
                                <div class="match-result-card">
                                    <div class="match-badge-locality">
                                        <i class="fa-solid fa-location-crosshairs"></i> ${h.isLocalityMatch ? 'Same Locality Match' : 'Nearby Facility'}
                                    </div>
                                    <div class="match-hospital-name">${h.hospitalName}</div>
                                    <div class="match-meta">
                                        <i class="fa-solid fa-map-pin"></i> ${h.address || h.locality} &bull; ${distanceLabel}
                                    </div>
                                    <div class="match-stats-row">
                                        <div class="match-stat-box">
                                            <div class="match-stat-val">${stockUnits} Unit(s)</div>
                                            <span style="color:#64748B;">Reported Stock</span>
                                        </div>
                                        <div class="match-stat-box" style="border-left:1px solid #E2E8F0; padding-left:12px;">
                                            <div class="match-stat-val" style="color:#0369A1;">${h.matchingDonorsCount} Donors</div>
                                            <span style="color:#64748B;">Compatible</span>
                                        </div>
                                    </div>
                                    <a href="${reqLink}" class="btn-req-from-hosp">
                                        <i class="fa-solid fa-paper-plane"></i> Request from this Hospital
                                    </a>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } catch (err) {
                console.error("Smart match search error:", err);
                smartMatchResultsContainer.innerHTML = `<p style="color:#DC2626;">Unable to complete match query. Please try again.</p>`;
            } finally {
                if (searchBtn) {
                    searchBtn.disabled = false;
                    searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Find Matches';
                }
            }
        });
    }

    // ==============================================================================
    // 5. EMERGENCY REQUEST SUBMISSION (emergency-request.html)
    // ==============================================================================
    const emergencyForm = document.getElementById("emergencyForm");
    const hospitalSelect = document.getElementById("hospital");
    const bloodOption = document.getElementById("bloodOption");
    const organOption = document.getElementById("organOption");
    const bloodSection = document.getElementById("bloodSection");
    const organSection = document.getElementById("organSection");

    // Dynamic Section Toggling
    if (bloodOption && organOption && bloodSection && organSection) {
        bloodOption.addEventListener("change", () => {
            bloodSection.style.display = "block";
            organSection.style.display = "none";
        });
        organOption.addEventListener("change", () => {
            bloodSection.style.display = "none";
            organSection.style.display = "block";
        });
    }

    // Populate verified hospitals dropdown
    if (hospitalSelect) {
        try {
            const hRes = await window.LifeLinkAPI.getPatientHospitals();
            if (hRes.success && hRes.data && hRes.data.length > 0) {
                const seen = new Set();
                const uniqueHospitals = hRes.data.filter(h => {
                    const norm = (h.hospitalName || '').toLowerCase().replace(/\s+/g, ' ').trim();
                    if (seen.has(norm)) return false;
                    seen.add(norm);
                    return true;
                });

                hospitalSelect.innerHTML = `<option value="">Select Verified Hospital Network</option>` +
                    uniqueHospitals.map(h => `<option value="${h._id}">${h.displayName || (h.hospitalName + ' — ' + (h.locality ? h.locality + ', ' : '') + (h.city || 'Punjab'))}</option>`).join('');

                // Check query params to auto-select
                const params = new URLSearchParams(window.location.search);
                const preselectedHospId = params.get("hospitalId");
                const preselectedBlood = params.get("bloodGroup");

                if (preselectedHospId) hospitalSelect.value = preselectedHospId;
                if (preselectedBlood) {
                    const bgSelect = document.getElementById("bloodGroup");
                    if (bgSelect) bgSelect.value = preselectedBlood;
                }
            } else {
                hospitalSelect.innerHTML = `<option value="">No verified hospitals currently available</option>`;
            }
        } catch (e) {
            console.warn("Could not load hospital list:", e);
            hospitalSelect.innerHTML = `<option value="">Unable to load hospital list</option>`;
        }
    }

    // Emergency Request Form Submit
    if (emergencyForm) {
        emergencyForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const donationTypeRadio = document.querySelector('input[name="donationType"]:checked');
            if (!donationTypeRadio) {
                window.LifeLinkAPI.showToast("Please choose Blood or Organ requirement.", "warning");
                return;
            }

            const donationType = donationTypeRadio.value === "blood" ? "Blood" : "Organ";
            const bloodGroupVal = document.getElementById("bloodGroup")?.value || "";
            const organVal = document.getElementById("organRequired")?.value || "";
            const hospitalId = hospitalSelect ? hospitalSelect.value : "";
            const locationVal = document.getElementById("location")?.value.trim() || "";
            const priorityVal = document.getElementById("priority")?.value || "Normal";
            const descVal = document.getElementById("description")?.value.trim() || "";

            if (donationType === "Blood" && !bloodGroupVal) {
                window.LifeLinkAPI.showToast("Please select the required Blood Group.", "warning");
                return;
            }

            if (donationType === "Organ" && !organVal) {
                window.LifeLinkAPI.showToast("Please specify the required Organ.", "warning");
                return;
            }

            if (!hospitalId) {
                window.LifeLinkAPI.showToast("Please select the target hospital.", "warning");
                return;
            }

            if (!locationVal) {
                window.LifeLinkAPI.showToast("Please specify ward or clinical location.", "warning");
                return;
            }

            if (!descVal) {
                window.LifeLinkAPI.showToast("Please provide a clinical summary.", "warning");
                return;
            }

            const submitBtn = document.getElementById("patientSubmitBtn") || emergencyForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dispatching Request...';
            }

            const payload = {
                hospitalId,
                donationType: donationType === "Blood" ? "Blood" : organVal,
                bloodGroup: donationType === "Blood" ? bloodGroupVal : null,
                organRequired: donationType === "Organ" ? organVal : null,
                requiredUnits: 1,
                urgency: priorityVal,
                location: locationVal,
                description: descVal
            };

            try {
                const res = await window.LifeLinkAPI.createPatientRequest(payload);
                if (res.success) {
                    window.LifeLinkAPI.showToast("Emergency request created and dispatched to hospital triage queue!", "success");
                    setTimeout(() => {
                        window.location.href = "my-requests.html";
                    }, 1200);
                } else {
                    window.LifeLinkAPI.showToast(res.message || "Failed to submit request.", "error");
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Dispatch Request';
                    }
                }
            } catch (err) {
                console.error("Emergency submit error:", err);
                window.LifeLinkAPI.showToast("Server error dispatching request.", "error");
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Dispatch Request';
                }
            }
        });
    }

    // ==============================================================================
    // 6. REQUESTS LISTING & RESPONSES DISPLAY (my-requests.html & dashboard)
    // ==============================================================================
    const requestList = document.getElementById("requestList");
    const dashboardRecentContainer = document.getElementById("dashboardRecentContainer");
    let currentStatusFilter = "all";

    async function loadPatientRequests(statusFilter = "all") {
        if (!requestList && !dashboardRecentContainer) return;

        const targetContainer = requestList || dashboardRecentContainer;
        targetContainer.innerHTML = `
            <div style="text-align:center; padding:30px; color:#64748B;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:24px; color:#871622; margin-bottom:8px; display:block;"></i>
                Retrieving your clinical requests & hospital responses...
            </div>
        `;

        try {
            const queryParam = (statusFilter === "all" || !statusFilter) ? "" : statusFilter;
            const res = await window.LifeLinkAPI.getPatientRequests(queryParam);

            // Update Summary Counters from API aggregate data
            if (res && res.summary) {
                const setEl = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = val !== undefined ? val : 0;
                };
                setEl("statPendingRequests", res.summary.pending);
                setEl("statReviewedRequests", res.summary.reviewed);
                setEl("statCompletedRequests", res.summary.completed);
                setEl("statTotalRequests", res.summary.total);
                setEl("summaryTotal", res.summary.total);
                setEl("summaryPending", res.summary.pending);
                setEl("summaryAccepted", res.summary.reviewed);
                setEl("summaryCompleted", res.summary.completed);
            }

            if (!res.success || !res.data || res.data.length === 0) {
                const cleanFilter = (statusFilter || "all").toLowerCase();
                let emptyMsg = "You have not submitted any blood or organ requests yet.";
                let showRaiseBtn = true;

                if (cleanFilter === "pending") {
                    emptyMsg = "No requests are currently awaiting hospital review.";
                    showRaiseBtn = true;
                } else if (cleanFilter === "reviewed" || cleanFilter === "accepted") {
                    emptyMsg = "No accepted or matched requests yet.";
                    showRaiseBtn = false;
                } else if (cleanFilter === "completed") {
                    emptyMsg = "No completed transfers yet.";
                    showRaiseBtn = false;
                }

                targetContainer.innerHTML = `
                    <div style="text-align:center; padding:32px 20px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; margin:16px 0;">
                        <i class="fa-solid fa-inbox" style="font-size:32px; color:#94A3B8; margin-bottom:10px; display:block;"></i>
                        <h4 style="font-size:16px; color:#0F172A; margin-bottom:4px;">No Emergency Requests Found</h4>
                        <p style="font-size:13px; color:#64748B; margin-bottom:${showRaiseBtn ? '14px' : '0'};">
                            ${emptyMsg}
                        </p>
                        ${showRaiseBtn ? `
                        <a href="emergency-request.html" class="emergency-btn" style="display:inline-block; font-size:13px; padding:8px 16px;">
                            Raise New Request
                        </a>` : ''}
                    </div>
                `;
                return;
            }

            const requests = res.data;

            // If summary was not provided in res, calculate from current array
            if (!res.summary) {
                const pending = requests.filter(r => r.status === "Pending Review" || r.status === "Under Review").length;
                const reviewed = requests.filter(r => r.status === "Reviewed — Response Sent" || r.status === "Completed").length;
                const completed = requests.filter(r => r.status === "Completed").length;

                const setEl = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = val;
                };
                setEl("statPendingRequests", pending);
                setEl("statReviewedRequests", reviewed);
                setEl("statCompletedRequests", completed);
                setEl("statTotalRequests", requests.length);
                setEl("summaryTotal", requests.length);
                setEl("summaryPending", pending);
                setEl("summaryAccepted", reviewed);
                setEl("summaryCompleted", completed);
            }

            // Limit to top 5 if on dashboard
            const displayItems = dashboardRecentContainer ? requests.slice(0, 5) : requests;

            targetContainer.innerHTML = displayItems.map(req => {
                const hospName = req.hospitalName || (req.hospital && req.hospital.hospitalName) || "Regional Hospital";
                const priorityClass = req.priority === "High" ? "priority-badge-high" : (req.priority === "Medium" ? "priority-badge-medium" : "priority-badge-low");

                let badgeColor = "#E2E8F0";
                let textColor = "#334155";
                if (req.status === "Reviewed — Response Sent") { badgeColor = "#DCFCE7"; textColor = "#15803D"; }
                else if (req.status === "Completed") { badgeColor = "#E0E7FF"; textColor = "#3730A3"; }
                else if (req.status === "Unable to Proceed — Explanation Sent") { badgeColor = "#FEE2E2"; textColor = "#991B1B"; }
                else if (req.status === "More Information Required") { badgeColor = "#FEF3C7"; textColor = "#92400E"; }

                const responsesHtml = (req.responses && req.responses.length > 0) ? `
                    <div style="background:#FFF; border:1px solid #E2E8F0; border-radius:8px; padding:12px; margin-top:12px;">
                        <strong style="font-size:12px; color:#475569; display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                            <i class="fa-solid fa-hospital-user" style="color:#871622;"></i> Hospital Clinical Responses (${req.responses.length})
                        </strong>
                        ${req.responses.map(resp => `
                            <div style="border-left:3px solid #871622; padding-left:10px; margin-bottom:8px; font-size:13px;">
                                <div style="font-size:11px; color:#64748B;">
                                    <strong>${resp.hospitalName || hospName}</strong> (${resp.senderName || "Hospital Medical Staff"}) &bull; ${new Date(resp.timestamp).toLocaleString()}
                                </div>
                                <div style="color:#0F172A; margin-top:2px;">${resp.message}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="font-size:12px; color:#64748B; font-style:italic; margin-top:8px;">
                        <i class="fa-regular fa-clock"></i> Awaiting clinical determination from ${hospName}...
                    </div>
                `;

                return `
                    <div class="request-card" style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:18px; margin-bottom:16px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                            <div>
                                <h3 style="font-size:16px; font-weight:700; color:#0F172A; margin-bottom:4px;">
                                    ${req.donationType} ${req.bloodGroup ? '(' + req.bloodGroup + ')' : (req.organRequired ? '(' + req.organRequired + ')' : '')}
                                </h3>
                                <div style="font-size:12px; color:#64748B;">
                                    Target: <strong>${hospName}</strong> &bull; Ward: ${req.location || 'Emergency'} &bull; ${new Date(req.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                            <div style="text-align:right;">
                                <span style="background:${badgeColor}; color:${textColor}; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:700;">
                                    ${req.status}
                                </span>
                            </div>
                        </div>

                        <div style="display:flex; gap:10px; margin:8px 0; font-size:12px; align-items:center;">
                            <span style="font-weight:600; color:#475569;">Triage Urgency:</span>
                            <span class="${priorityClass}">${req.priority || 'Normal'} Priority</span>
                            <span style="color:#64748B;">${req.priorityReason || ''}</span>
                        </div>

                        <div style="font-size:13px; color:#334155; margin-bottom:6px;">
                            <strong>Condition Summary:</strong> ${req.description}
                        </div>

                        ${responsesHtml}
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error("Load patient requests error:", err);
            targetContainer.innerHTML = `<p style="color:#DC2626; padding:20px;">Unable to load emergency requests.</p>`;
        }
    }

    // Filter Tabs on my-requests.html
    document.querySelectorAll(".request-tab").forEach(tab => {
        tab.addEventListener("click", function () {
            document.querySelectorAll(".request-tab").forEach(t => t.classList.remove("active"));
            this.classList.add("active");
            currentStatusFilter = this.getAttribute("data-status") || "all";
            loadPatientRequests(currentStatusFilter);
        });
    });

    // 7. Profile Form update (patient-profile.html)
    const profileForm = document.getElementById("profileForm");
    if (profileForm) {
        profileForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const name = document.getElementById("profileName")?.value.trim() || "";
            const phone = document.getElementById("profilePhone")?.value.trim() || "";
            const age = Number(document.getElementById("profileAge")?.value) || null;
            const gender = document.getElementById("profileGender")?.value || "";
            const bloodGroup = document.getElementById("profileBloodGroup")?.value || "";
            const address = document.getElementById("profileAddress")?.value.trim() || "";
            const locality = document.getElementById("profileLocality")?.value.trim() || "";
            const city = document.getElementById("profileCity")?.value.trim() || "";
            const state = document.getElementById("profileState")?.value.trim() || "";
            const pincode = document.getElementById("profilePincode")?.value.trim() || "";

            const emergencyName = document.getElementById("profileEmergencyName")?.value.trim() || "";
            const emergencyPhone = document.getElementById("profileEmergencyPhone")?.value.trim() || "";
            const emergencyRel = document.getElementById("profileEmergencyRel")?.value.trim() || "";

            const medicalCondition = document.getElementById("profileMedicalCondition")?.value.trim() || "";
            const organRequirement = document.getElementById("profileOrganRequirement")?.value.trim() || "";

            // Validation
            if (!name) {
                window.LifeLinkAPI.showToast("Full legal name is required.", "warning");
                return;
            }
            if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
                window.LifeLinkAPI.showToast("Please enter a valid 10-digit mobile number.", "warning");
                return;
            }
            if (!age || age < 1 || age > 120) {
                window.LifeLinkAPI.showToast("Please provide a valid age.", "warning");
                return;
            }
            if (!gender) {
                window.LifeLinkAPI.showToast("Please select your biological gender.", "warning");
                return;
            }
            if (!bloodGroup) {
                window.LifeLinkAPI.showToast("Please select your blood group.", "warning");
                return;
            }
            if (!address) {
                window.LifeLinkAPI.showToast("Primary residential address is required.", "warning");
                return;
            }
            if (!city) {
                window.LifeLinkAPI.showToast("City / District is required.", "warning");
                return;
            }
            if (!emergencyPhone || !/^[6-9]\d{9}$/.test(emergencyPhone)) {
                window.LifeLinkAPI.showToast("Please enter a valid 10-digit emergency contact phone.", "warning");
                return;
            }

            const payload = {
                name,
                phone,
                age,
                gender,
                bloodGroup,
                address,
                locality,
                city,
                state,
                pincode,
                emergencyContact: {
                    name: emergencyName,
                    phone: emergencyPhone,
                    relationship: emergencyRel
                },
                medicalCondition,
                organRequirement
            };

            const saveBtn = document.getElementById("saveProfileBtn") || profileForm.querySelector('button[type="submit"]');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Profile...';
            }

            try {
                const res = await window.LifeLinkAPI.updatePatientProfile(payload);
                if (res.success && res.data) {
                    patientProfile = res.data;
                    window.LifeLinkAPI.showToast(res.message || "Patient medical profile updated successfully.", "success");

                    // Update user name in local state
                    const curUser = window.LifeLinkAPI.getUser() || {};
                    curUser.name = res.data.name;
                    curUser.isProfileComplete = res.data.isProfileComplete;
                    window.LifeLinkAPI.setUser(curUser);

                    populateProfileView(patientProfile);

                    // If in onboarding mode or previous state was incomplete, redirect to dashboard
                    if (isOnboarding || !patientProfile.isProfileComplete) {
                        setTimeout(() => {
                            window.location.href = "patientdashboard.html";
                        }, 1200);
                    } else {
                        // Switch back to view mode
                        const viewContainer = document.getElementById("profileViewContainer");
                        const editContainer = document.getElementById("profileEditContainer");
                        const onboardingBanner = document.getElementById("onboardingBanner");
                        if (onboardingBanner) onboardingBanner.style.display = "none";
                        if (editContainer) editContainer.style.display = "none";
                        if (viewContainer) viewContainer.style.display = "block";
                    }
                } else {
                    window.LifeLinkAPI.showToast(res.message || "Failed to update profile.", "error");
                }
            } catch (err) {
                console.error("Profile save error:", err);
                window.LifeLinkAPI.showToast("Server error saving profile.", "error");
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Patient Profile';
                }
            }
        });
    }

    // Initialize requests loading
    await loadPatientRequests();
});
