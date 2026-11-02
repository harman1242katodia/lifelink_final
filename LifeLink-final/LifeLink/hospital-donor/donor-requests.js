/**
 * ==============================================================================
 * LifeLink — Donor Portal Controller
 * ==============================================================================
 * 
 * Manages volunteer donor applications:
 * - Real JWT authentication and donor authorization verification
 * - Dynamic hospital network dropdown population from MongoDB
 * - Clinical health metrics validation
 * - Post application to POST /api/donor/applications
 * - View existing applications history and hospital determinations
 * ==============================================================================
 */

document.addEventListener("DOMContentLoaded", async function () {
    // 1. Session Verification & Role Authorization Guard
    if (!window.LifeLinkAPI || !window.LifeLinkAPI.isAuthenticated()) {
        const currentPath = window.location.pathname;
        window.location.href = `../loginpage/login.html?role=donor&redirect=${encodeURIComponent(currentPath)}`;
        return;
    }

    const currentRole = (window.LifeLinkAPI.getRole() || "").toLowerCase();
    if (currentRole === "hospital") {
        document.body.style.display = "none";
        window.LifeLinkAPI.showToast("Access restricted: Hospital accounts cannot submit donor applications. Redirecting to Hospital Review Dashboard...", "error", 4000);
        window.location.href = "../hospital-donor/hospital-requests.html";
        return;
    }

    if (currentRole === "patient") {
        document.body.style.display = "none";
        window.LifeLinkAPI.showToast("Access restricted: Patient accounts cannot submit donor applications. Redirecting to Patient Portal...", "error", 4000);
        window.location.href = "../patient/patientdashboard.html";
        return;
    }

    if (currentRole !== "donor") {
        document.body.style.display = "none";
        window.LifeLinkAPI.showToast("Access restricted: Donor credentials required.", "error", 3000);
        window.location.href = "../loginpage/login.html?role=donor";
        return;
    }

    // DOM Elements
    const donorForm = document.getElementById("donorForm");
    const successMessage = document.getElementById("successMessage");
    const bloodDetails = document.getElementById("bloodDetails");
    const organDetails = document.getElementById("organDetails");
    const bloodGroup = document.getElementById("bloodGroup");
    const bloodGroupDetail = document.getElementById("bloodGroupDetail");
    const city = document.getElementById("city");
    const organCity = document.getElementById("organCity");
    const selectedOrgan = document.getElementById("selectedOrgan");
    const requiredUnits = document.getElementById("requiredUnits");
    const preferredDonationDate = document.getElementById("preferredDonationDate");
    const hospitalSelect = document.getElementById("hospitalName");
    const submitBtn = document.getElementById("submitBtn");
    const donorSignOutBtn = document.getElementById("donorSignOutBtn");
    const historyContainer = document.getElementById("donorApplicationsHistory");

    // Sign Out
    if (donorSignOutBtn) {
        donorSignOutBtn.addEventListener("click", () => window.LifeLinkAPI.logout());
    }

    // 2. Helpers & Selectors
    function getSelectedDonationType() {
        const selected = document.querySelector('input[name="donationType"]:checked');
        return selected ? selected.value : "Blood";
    }

    function isBloodDonation(type) {
        return type === "Blood";
    }

    function getFieldValue(id) {
        const field = document.getElementById(id);
        return field ? field.value.trim() : "";
    }

    function setFieldError(fieldId, message) {
        const errorElement = document.querySelector('[data-error-for="' + fieldId + '"]');
        const field = document.getElementById(fieldId);
        const group = field ? field.closest(".form-group") : null;

        if (errorElement) {
            errorElement.textContent = message || "";
        }
        if (group) {
            group.classList.toggle("invalid", Boolean(message));
        }
    }

    function clearAllErrors() {
        document.querySelectorAll(".field-error").forEach(el => {
            el.textContent = "";
        });
        document.querySelectorAll(".form-group.invalid").forEach(el => {
            el.classList.remove("invalid");
        });
    }

    // 3. Dynamic Toggle Between Blood & Organ Sections
    function updateDonationPanels() {
        const type = getSelectedDonationType();
        if (isBloodDonation(type)) {
            if (bloodDetails) bloodDetails.classList.remove("hidden");
            if (organDetails) organDetails.classList.add("hidden");
        } else {
            if (bloodDetails) bloodDetails.classList.add("hidden");
            if (organDetails) organDetails.classList.remove("hidden");
            if (selectedOrgan) selectedOrgan.value = type;
            if (organCity && city && !organCity.value) {
                organCity.value = city.value;
            }
        }
    }

    document.querySelectorAll('input[name="donationType"]').forEach(input => {
        input.addEventListener("change", updateDonationPanels);
    });

    // 4. Form Validation
    function validateForm() {
        clearAllErrors();
        let valid = true;
        let firstInvalid = null;

        function fail(fieldId, message) {
            setFieldError(fieldId, message);
            valid = false;
            if (!firstInvalid) {
                firstInvalid = document.getElementById(fieldId);
            }
        }

        const donorName = getFieldValue("donorName");
        if (!donorName) fail("donorName", "Full legal name is required.");

        const age = getFieldValue("age");
        if (!age || Number(age) < 18 || Number(age) > 65) {
            fail("age", "Donor age must be between 18 and 65.");
        }

        if (!getFieldValue("gender")) fail("gender", "Please select your gender.");
        if (!getFieldValue("bloodGroup")) fail("bloodGroup", "Blood group is required.");

        const phone = getFieldValue("phone");
        if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
            fail("phone", "Enter a valid 10-digit mobile number.");
        }

        const email = getFieldValue("email");
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            fail("email", "Valid email address is required.");
        }

        if (!getFieldValue("city")) fail("city", "City is required.");
        if (!getFieldValue("pincode") || !/^\d{6}$/.test(getFieldValue("pincode"))) {
            fail("pincode", "Enter a valid 6-digit postal code.");
        }

        // Donation Specific
        const donationType = getSelectedDonationType();
        if (isBloodDonation(donationType)) {
            if (!getFieldValue("bloodGroupDetail") && !getFieldValue("bloodGroup")) {
                fail("bloodGroupDetail", "Please specify donation blood group.");
            }
            if (!getFieldValue("preferredDonationDate")) {
                fail("preferredDonationDate", "Select preferred donation date.");
            }
        } else {
            if (!getFieldValue("selectedOrgan")) fail("selectedOrgan", "Please select organ.");
            if (!getFieldValue("organCity")) fail("organCity", "Transplant city is required.");
        }

        // Target Hospital
        if (!getFieldValue("hospitalName")) {
            fail("hospitalName", "Please select target hospital.");
        }

        // Health Screening
        const weight = getFieldValue("weight");
        if (!weight || Number(weight) < 45) {
            fail("weight", "Minimum donor weight is 45 kg.");
        }

        const hemoglobin = getFieldValue("hemoglobin");
        if (!hemoglobin || Number(hemoglobin) <= 0) {
            fail("hemoglobin", "Valid hemoglobin measurement is required.");
        }

        const bp = getFieldValue("bloodPressure");
        if (!bp || !/^\d{2,3}\/\d{2,3}$/.test(bp)) {
            fail("bloodPressure", "Enter blood pressure in format 120/80.");
        }

        if (!getFieldValue("chronicDisease")) fail("chronicDisease", "Please select an option.");
        if (!getFieldValue("medication")) fail("medication", "Please select an option.");
        if (!getFieldValue("smoker")) fail("smoker", "Please select an option.");

        if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
            firstInvalid.focus();
        }

        return valid;
    }

    // 5. Load Hospitals Network & Application History
    let currentDonorProfile = null;

    function updateDonorAvatar(pictureUrl) {
        if (!pictureUrl) return;
        const donorImg = document.getElementById("donorProfileImg");
        const defaultIcon = document.getElementById("donorDefaultIcon");
        const urlWithCacheBuster = pictureUrl.startsWith('data:') ? pictureUrl : `${pictureUrl}?t=${Date.now()}`;
        if (donorImg) {
            donorImg.src = urlWithCacheBuster;
            donorImg.style.display = "block";
            if (defaultIcon) defaultIcon.style.display = "none";
        }
    }

    async function loadDonorProfileAndHospitals() {
        try {
            // Load donor profile details & photo
            const profileRes = await window.LifeLinkAPI.getDonorProfile();
            if (profileRes.success && profileRes.data) {
                currentDonorProfile = profileRes.data;
                const nameEl = document.getElementById("donorProfileDisplayName");
                if (nameEl) nameEl.textContent = currentDonorProfile.name || "Verified Donor";

                if (currentDonorProfile.profilePicture) {
                    updateDonorAvatar(currentDonorProfile.profilePicture);
                }

                // If form fields are empty, prefill donor name and contact
                const nameInput = document.getElementById("donorName");
                if (nameInput && !nameInput.value) nameInput.value = currentDonorProfile.name || "";
                const phoneInput = document.getElementById("phone");
                if (phoneInput && !phoneInput.value) phoneInput.value = currentDonorProfile.contact || "";
                const emailInput = document.getElementById("email");
                if (emailInput && !emailInput.value) emailInput.value = currentDonorProfile.email || "";
            }

            // Setup profile photo upload handler
            const photoInput = document.getElementById("donorPhotoInput");
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
                    reader.onload = e => updateDonorAvatar(e.target.result);
                    reader.readAsDataURL(file);

                    window.LifeLinkAPI.showToast("Uploading donor profile picture...", "info", 2000);
                    const formData = new FormData();
                    formData.append("profilePicture", file);

                    try {
                        const uploadRes = await window.LifeLinkAPI.uploadDonorProfilePicture(formData);
                        if (uploadRes.success && uploadRes.profilePicture) {
                            if (currentDonorProfile) currentDonorProfile.profilePicture = uploadRes.profilePicture;
                            updateDonorAvatar(uploadRes.profilePicture);
                            window.LifeLinkAPI.showToast("Profile picture uploaded successfully!", "success");
                        } else {
                            window.LifeLinkAPI.showToast(uploadRes.message || "Failed to upload image.", "error");
                            if (currentDonorProfile && currentDonorProfile.profilePicture) {
                                updateDonorAvatar(currentDonorProfile.profilePicture);
                            }
                        }
                    } catch (err) {
                        console.error("Donor upload error:", err);
                        window.LifeLinkAPI.showToast("Network error uploading profile image.", "error");
                    } finally {
                        photoInput.value = "";
                    }
                });
            }

            // Load verified hospitals list into dropdown
            const hospitalsRes = await window.LifeLinkAPI.getDonorHospitals();
            if (hospitalsRes.success && hospitalsRes.data && hospitalsRes.data.length > 0) {
                if (hospitalSelect) {
                    const seen = new Set();
                    const uniqueHospitals = hospitalsRes.data.filter(h => {
                        const norm = (h.hospitalName || '').toLowerCase().replace(/\s+/g, ' ').trim();
                        if (seen.has(norm)) return false;
                        seen.add(norm);
                        return true;
                    });

                    hospitalSelect.innerHTML = `<option value="">Select Hospital Network</option>` +
                        uniqueHospitals.map(h => `
                            <option value="${h._id}">${h.displayName || (h.hospitalName + ' — ' + (h.locality ? h.locality + ', ' : '') + (h.city || 'Punjab'))}</option>
                        `).join('');
                }
            } else if (hospitalSelect) {
                hospitalSelect.innerHTML = `<option value="">No verified hospitals currently available</option>`;
            }

            // Application history is loaded below
            await loadApplicationHistory();
        } catch (err) {
            console.error("Error loading donor hospitals/history:", err);
            if (hospitalSelect) {
                hospitalSelect.innerHTML = `<option value="">Unable to load hospital list</option>`;
            }
        }
    }

    // 6. Load Application History
    async function loadApplicationHistory() {
        if (!historyContainer) return;
        try {
            const res = await window.LifeLinkAPI.getDonorApplications();
            if (!res.success || !res.data || res.data.length === 0) {
                historyContainer.innerHTML = `
                    <div style="text-align:center; padding:20px; color:#64748B;">
                        <i class="fa-solid fa-folder-open" style="font-size:24px; margin-bottom:8px; display:block;"></i>
                        No donation applications submitted yet.
                    </div>
                `;
                return;
            }

            historyContainer.innerHTML = res.data.map(app => {
                const hospName = app.hospitalName || (app.hospital && app.hospital.hospitalName) || "Target Hospital";
                let badgeColor = "#E2E8F0";
                let textColor = "#334155";
                if (app.status === "Accepted") { badgeColor = "#DCFCE7"; textColor = "#15803D"; }
                else if (app.status === "Rejected") { badgeColor = "#FEE2E2"; textColor = "#991B1B"; }
                else if (app.status === "Under Review") { badgeColor = "#FEF3C7"; textColor = "#92400E"; }

                const decisionInfo = app.hospitalDecision && app.hospitalDecision.decision ? `
                    <div style="background:#FFF; border:1px solid #E2E8F0; padding:10px; border-radius:6px; margin-top:10px; font-size:13px;">
                        <strong>Hospital Decision:</strong> ${app.hospitalDecision.decision}<br>
                        ${app.hospitalDecision.instructions ? `<strong>Instructions:</strong> ${app.hospitalDecision.instructions}<br>` : ''}
                        ${app.hospitalDecision.explanation ? `<strong>Explanation:</strong> ${app.hospitalDecision.explanation}<br>` : ''}
                        <small style="color:#64748B;">Decided on ${new Date(app.hospitalDecision.decidedAt).toLocaleString()}</small>
                    </div>
                ` : '';

                return `
                    <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:16px; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <div>
                                <strong style="font-size:15px; color:#0F172A;">${app.donationType} (${app.bloodGroup || 'Standard'})</strong>
                                <div style="font-size:12px; color:#64748B;">Target: ${hospName} • Submitted: ${new Date(app.createdAt).toLocaleDateString()}</div>
                            </div>
                            <span style="background:${badgeColor}; color:${textColor}; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:700;">
                                ${app.status}
                            </span>
                        </div>
                        ${decisionInfo}
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error("Error loading application history:", e);
            historyContainer.innerHTML = `<p style="color:#DC2626; font-size:13px;">Unable to load application history.</p>`;
        }
    }

    // 7. Form Submission Handler
    if (donorForm) {
        donorForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            if (!validateForm()) return;

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting Application...';
            }

            const donationType = getSelectedDonationType();
            const bloodSelected = isBloodDonation(donationType);
            const hospitalId = getFieldValue("hospitalName");
            const donorBloodGroup = bloodSelected 
                ? (getFieldValue("bloodGroupDetail") || getFieldValue("bloodGroup"))
                : getFieldValue("bloodGroup");

            const payload = {
                hospitalId,
                donationType,
                donationCategory: bloodSelected ? "Blood" : "Organ/Tissue",
                bloodGroup: donorBloodGroup,
                requiredUnits: bloodSelected ? (Number(getFieldValue("requiredUnits")) || 1) : 1,
                preferredDonationDate: bloodSelected ? getFieldValue("preferredDonationDate") : "",
                selectedOrgan: bloodSelected ? "" : getFieldValue("selectedOrgan"),
                organCity: bloodSelected ? "" : getFieldValue("organCity"),
                additionalInfo: bloodSelected ? "" : getFieldValue("organAdditionalInfo"),
                city: getFieldValue("city"),
                state: getFieldValue("state"),
                pincode: getFieldValue("pincode"),
                contact: getFieldValue("phone"),
                age: Number(getFieldValue("age")),
                gender: getFieldValue("gender"),
                healthInformation: {
                    weight: Number(getFieldValue("weight")),
                    hemoglobin: Number(getFieldValue("hemoglobin")),
                    bloodPressure: getFieldValue("bloodPressure"),
                    chronicDisease: getFieldValue("chronicDisease"),
                    medication: getFieldValue("medication"),
                    allergies: getFieldValue("allergies") || "None",
                    smoker: getFieldValue("smoker")
                }
            };

            try {
                const res = await window.LifeLinkAPI.submitDonorApplication(payload);
                if (res.success) {
                    window.LifeLinkAPI.showToast("Your donation application was submitted successfully!", "success");
                    if (successMessage) {
                        successMessage.className = "success-banner";
                        successMessage.innerHTML = `
                            <i class="fa-solid fa-circle-check" style="font-size:24px; color:#059669;"></i>
                            <div>
                                <strong>Application Submitted Successfully!</strong>
                                <p>Your pledge has been transmitted to the hospital clinical review queue. Status: <strong>Pending Review</strong>.</p>
                            </div>
                        `;
                        successMessage.classList.remove("hidden");
                    }
                    donorForm.reset();
                    await loadApplicationHistory();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                } else {
                    window.LifeLinkAPI.showToast(res.message || "Unable to submit application.", "error");
                }
            } catch (err) {
                console.error("Submission error:", err);
                window.LifeLinkAPI.showToast("Server error during application submission.", "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Application to Hospital';
                }
            }
        });
    }

    // Initialize
    await loadDonorProfileAndHospitals();
});
