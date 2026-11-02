/**
 * ==============================================================================
 * LifeLink — Authentication Controller
 * ==============================================================================
 * 
 * Authenticates users via the Node.js/Express JWT backend:
 * - Real bcrypt verification via POST /api/auth/login
 * - Real user and profile persistence via POST /api/auth/register
 * - JWT storage in localStorage/sessionStorage
 * - Role-specific portal redirection (Patient, Hospital, Donor)
 * - Zero plain-text credentials stored in localStorage
 * ==============================================================================
 */

document.addEventListener("DOMContentLoaded", function () {
    // 1. DOM Elements
    const loginCard = document.getElementById("loginCard");
    const showLogin = document.getElementById("showLogin");
    const showSignup = document.getElementById("showSignup");
    const signupBtn = document.getElementById("signupBtn");
    const loginBtn = document.getElementById("loginBtn");

    // 2. Flip Animation Controls
    if (showLogin && loginCard) {
        showLogin.addEventListener("click", function (event) {
            event.preventDefault();
            loginCard.classList.add("flipped");
        });
    }

    if (showSignup && loginCard) {
        showSignup.addEventListener("click", function (event) {
            event.preventDefault();
            loginCard.classList.remove("flipped");
        });
    }

    // Toggle password eye icon
    const togglePass = document.querySelector(".input-box .toggle");
    if (togglePass) {
        togglePass.addEventListener("click", function () {
            const passInput = document.getElementById("loginPassword");
            if (passInput) {
                const isPass = passInput.getAttribute("type") === "password";
                passInput.setAttribute("type", isPass ? "text" : "password");
                this.classList.toggle("fa-eye");
                this.classList.toggle("fa-eye-slash");
            }
        });
    }

    // 3. Validation Helpers
    function validEmail(email) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailPattern.test(email);
    }

    function validPassword(password) {
        return password && password.length >= 6;
    }

    function notify(message, type = "info") {
        if (window.LifeLinkAPI && typeof window.LifeLinkAPI.showToast === "function") {
            window.LifeLinkAPI.showToast(message, type);
        } else {
            alert(message);
        }
    }

    // 4. Role Selection & Query Param Handling
    const urlParams = new URLSearchParams(window.location.search);
    const paramRole = (urlParams.get("role") || "").toLowerCase().trim();
    const paramRedirect = urlParams.get("redirect") || "";
    const validRoles = ["patient", "hospital", "donor"];

    // Check for role mismatch against existing session: purge stale credentials
    if (window.LifeLinkAPI && window.LifeLinkAPI.isAuthenticated()) {
        const activeRole = (window.LifeLinkAPI.getRole() || "").toLowerCase();
        if (paramRole && activeRole && paramRole !== activeRole) {
            console.log(`[LifeLink Auth] Role switch detected (active: ${activeRole}, requested: ${paramRole}). Purging stale cross-role credentials.`);
            window.LifeLinkAPI.clearAuth();
        }
    }

    let selectedRole = validRoles.includes(paramRole) ? paramRole : "donor";
    const allRoleElements = document.querySelectorAll(".role");

    function updateRoleSelection(targetRoleName) {
        if (!targetRoleName) return;
        selectedRole = targetRoleName.toLowerCase();

        allRoleElements.forEach(r => {
            const roleAttr = (r.getAttribute("data-role") || r.textContent).trim().toLowerCase();
            if (roleAttr === selectedRole) {
                r.classList.add("active");
            } else {
                r.classList.remove("active");
            }
        });
    }

    // Apply initial role preselection from URL parameter
    updateRoleSelection(selectedRole);

    allRoleElements.forEach(roleEl => {
        roleEl.addEventListener("click", function () {
            const roleName = (this.getAttribute("data-role") || this.querySelector("span")?.textContent || "donor").trim();
            updateRoleSelection(roleName);
        });
    });

    // Destination redirection helper
    function redirectAfterAuth(user) {
        const role = (user && user.role ? user.role : selectedRole).toLowerCase();

        // If patient registration or login indicates incomplete profile, route to onboarding
        if (role === "patient" && user && user.isProfileComplete === false) {
            window.location.href = "../patient/patient-profile.html?onboarding=true";
            return;
        }

        // Handle safe redirect parameter with strict role authorization
        if (paramRedirect) {
            try {
                const decoded = decodeURIComponent(paramRedirect);
                if (role === "patient" && (
                    decoded.includes("patientdashboard.html") ||
                    decoded.includes("emergency-request.html") ||
                    decoded.includes("my-requests.html") ||
                    decoded.includes("patient-profile.html")
                )) {
                    window.location.href = decoded;
                    return;
                }
                if (role === "hospital" && (
                    decoded.includes("hospital-requests.html") ||
                    decoded.includes("hospital-register.html")
                ) && !decoded.includes("donor-requests.html")) {
                    window.location.href = decoded;
                    return;
                }
                if (role === "donor" && decoded.includes("donor-requests.html")) {
                    window.location.href = decoded;
                    return;
                }
            } catch (e) {
                console.warn("Invalid redirect URL:", e);
            }
        }

        if (role === "hospital") {
            window.location.href = "../hospital-donor/hospital-requests.html";
        } else if (role === "patient") {
            window.location.href = "../patient/patientdashboard.html";
        } else {
            window.location.href = "../hospital-donor/donor-requests.html";
        }
    }

    // 5. Registration Handler (POST /api/auth/register)
    if (signupBtn) {
        signupBtn.addEventListener("click", async function () {
            const nameInput = document.getElementById("signupName");
            const emailInput = document.getElementById("signupEmail");
            const passwordInput = document.getElementById("signupPassword");
            const confirmPasswordInput = document.getElementById("signupConfirmPassword");

            const name = nameInput ? nameInput.value.trim() : "";
            const email = emailInput ? emailInput.value.trim() : "";
            const password = passwordInput ? passwordInput.value : "";
            const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : "";

            if (!name) {
                notify("Please enter your full legal name.", "warning");
                return;
            }

            if (!validEmail(email)) {
                notify("Please enter a valid email address.", "warning");
                return;
            }

            if (!validPassword(password)) {
                notify("Password must contain at least 6 characters.", "warning");
                return;
            }

            if (password !== confirmPassword) {
                notify("Passwords do not match.", "warning");
                return;
            }

            signupBtn.disabled = true;
            signupBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';

            try {
                const result = await window.LifeLinkAPI.register({
                    name,
                    email,
                    password,
                    role: selectedRole
                });

                if (result.success) {
                    notify("Registration successful! Redirecting...", "success");
                    setTimeout(() => {
                        redirectAfterAuth(result.user);
                    }, 1200);
                } else {
                    notify(result.message || "Registration failed. Please try again.", "error");
                    signupBtn.disabled = false;
                    signupBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
                }
            } catch (err) {
                console.error("Sign-up error:", err);
                notify("An error occurred during account creation.", "error");
                signupBtn.disabled = false;
                signupBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
            }
        });
    }

    // 6. Login Handler (POST /api/auth/login)
    if (loginBtn) {
        loginBtn.addEventListener("click", async function () {
            const emailInput = document.getElementById("loginEmail");
            const passwordInput = document.getElementById("loginPassword");

            const email = emailInput ? emailInput.value.trim() : "";
            const password = passwordInput ? passwordInput.value : "";

            if (!email || !password) {
                notify("Please enter both email and password.", "warning");
                return;
            }

            if (!validEmail(email)) {
                notify("Please enter a valid email address.", "warning");
                return;
            }

            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';

            try {
                const result = await window.LifeLinkAPI.login({
                    email,
                    password,
                    role: selectedRole
                });

                if (result.success && result.token) {
                    notify(`Welcome back, ${result.user.name}! Redirecting...`, "success");
                    setTimeout(() => {
                        redirectAfterAuth(result.user);
                    }, 1000);
                } else {
                    notify(result.message || "Invalid credentials. Please verify your email and password.", "error");
                    loginBtn.disabled = false;
                    loginBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In';
                }
            } catch (err) {
                console.error("Sign-in error:", err);
                notify("Unable to connect to authentication service.", "error");
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In';
            }
        });
    }

    // Auto-fill demo helpers when clicking role on login face
    const demoBox = document.querySelector(".card-back .demo-helper-box");
    if (demoBox) {
        demoBox.innerHTML = `
            <span>💡 Seeded Demo Accounts:</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;">
                <button type="button" class="demo-tag" data-email="patient@lifelink.org" data-role="patient" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:2px 8px; font-size:11px; cursor:pointer;">Patient</button>
                <button type="button" class="demo-tag" data-email="hospital@citycare.com" data-role="hospital" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:2px 8px; font-size:11px; cursor:pointer;">Hospital</button>
                <button type="button" class="demo-tag" data-email="donor@lifelink.org" data-role="donor" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:2px 8px; font-size:11px; cursor:pointer;">Donor</button>
            </div>
        `;

        demoBox.querySelectorAll(".demo-tag").forEach(tag => {
            tag.addEventListener("click", function () {
                const targetEmail = this.getAttribute("data-email");
                const targetRole = this.getAttribute("data-role");
                const emailInput = document.getElementById("loginEmail");
                const passInput = document.getElementById("loginPassword");
                if (emailInput) emailInput.value = targetEmail;
                if (passInput) passInput.value = "Password123!";
                updateRoleSelection(targetRole);
            });
        });
    }
});
