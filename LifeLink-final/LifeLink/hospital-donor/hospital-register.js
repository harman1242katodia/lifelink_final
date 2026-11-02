/**
 * ==============================================================================
 * LifeLink — Hospital Registration & Profile Management Controller
 * ==============================================================================
 * 
 * - Registers new accredited medical facility accounts via POST /api/auth/register
 * - Allows authenticated hospitals to update facility profile via PUT /api/hospital/profile
 * - Zero plain-text credentials stored in localStorage
 * ==============================================================================
 */

document.addEventListener("DOMContentLoaded", async function () {
    const form = document.getElementById("hospitalForm");
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

    // Check if user is already authenticated as hospital
    let isAlreadyHospital = false;
    if (window.LifeLinkAPI && window.LifeLinkAPI.isAuthenticated() && window.LifeLinkAPI.getRole() === "hospital") {
        isAlreadyHospital = true;
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Hospital Profile';
        }
        // Pre-fill existing profile data
        try {
            const res = await window.LifeLinkAPI.getHospitalProfile();
            if (res.success && res.data) {
                const h = res.data;
                const setVal = (id, val) => {
                    const el = document.getElementById(id);
                    if (el && val !== undefined) el.value = val;
                };
                setVal("hospitalName", h.hospitalName);
                setVal("licenseNumber", h.licenseNumber);
                setVal("address", h.address);
                setVal("contact", h.contact);
                setVal("email", h.email);

                // Disable password field if just updating profile
                const passField = document.getElementById("password");
                if (passField) {
                    passField.placeholder = "Leave blank to keep existing password";
                    passField.required = false;
                }
            }
        } catch (e) {
            console.warn("Could not load hospital profile:", e);
        }
    }

    if (!form) return;

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const hospitalName = document.getElementById("hospitalName").value.trim();
        const licenseNumber = document.getElementById("licenseNumber").value.trim();
        const address = document.getElementById("address").value.trim();
        const contact = document.getElementById("contact").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password") ? document.getElementById("password").value : "";
        const terms = document.getElementById("terms").checked;

        // Clear error text
        ["hospitalNameError", "licenseError", "addressError", "contactError", "emailError", "passwordError"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = "";
        });

        let valid = true;

        if (!hospitalName) {
            document.getElementById("hospitalNameError").innerText = "Hospital name is required.";
            valid = false;
        }

        if (!licenseNumber) {
            document.getElementById("licenseError").innerText = "License number is required.";
            valid = false;
        }

        if (!address) {
            document.getElementById("addressError").innerText = "Hospital address is required.";
            valid = false;
        }

        if (!/^[0-9]{10}$/.test(contact)) {
            document.getElementById("contactError").innerText = "Enter a valid 10-digit contact number.";
            valid = false;
        }

        if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
            document.getElementById("emailError").innerText = "Enter a valid email address.";
            valid = false;
        }

        if (!isAlreadyHospital && (!password || password.length < 6)) {
            document.getElementById("passwordError").innerText = "Password must be at least 6 characters.";
            valid = false;
        }

        if (!terms) {
            if (window.LifeLinkAPI) {
                window.LifeLinkAPI.showToast("Please agree to the Healthcare Provider Terms.", "warning");
            } else {
                alert("Please agree to the Healthcare Provider Terms.");
            }
            valid = false;
        }

        if (!valid) return;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
        }

        try {
            if (isAlreadyHospital) {
                // Update profile
                const updateRes = await window.LifeLinkAPI.updateHospitalProfile({
                    hospitalName,
                    address,
                    contact,
                    licenseNumber
                });

                if (updateRes.success) {
                    window.LifeLinkAPI.showToast("Hospital facility profile updated successfully!", "success");
                    setTimeout(() => {
                        window.location.href = "hospital-requests.html";
                    }, 1000);
                } else {
                    window.LifeLinkAPI.showToast(updateRes.message || "Failed to update profile.", "error");
                }
            } else {
                // Register new hospital account
                const registerRes = await window.LifeLinkAPI.register({
                    name: hospitalName,
                    email,
                    password,
                    role: "hospital",
                    phone: contact,
                    hospitalName,
                    licenseNumber,
                    address
                });

                if (registerRes.success) {
                    window.LifeLinkAPI.showToast("Hospital registered successfully! Redirecting...", "success");
                    setTimeout(() => {
                        window.location.href = "hospital-requests.html";
                    }, 1200);
                } else {
                    window.LifeLinkAPI.showToast(registerRes.message || "Registration failed.", "error");
                }
            }
        } catch (err) {
            console.error("Hospital form error:", err);
            window.LifeLinkAPI.showToast("Server error during hospital operation.", "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = isAlreadyHospital ? '<i class="fa-solid fa-floppy-disk"></i> Update Hospital Profile' : '<i class="fa-solid fa-building-circle-check"></i> Register Hospital';
            }
        }
    });
});
