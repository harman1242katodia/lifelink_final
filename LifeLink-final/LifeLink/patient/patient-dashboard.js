/* =========================================
   PATIENT INFORMATION
========================================= */

const patientGreeting =
    document.getElementById("patientGreeting");

const patientNameElement =
    document.getElementById("patientName");

const patientAvatar =
    document.getElementById("patientAvatar");


/*
    For now, patientName comes from localStorage.
    Later, Member 1's authentication will provide
    the actual logged-in patient's name.
*/

const patientName =
    localStorage.getItem("patientName") || "Patient";


/* =========================================
   TIME-BASED GREETING
========================================= */

function getGreeting() {

    const currentHour =
        new Date().getHours();


    if (currentHour < 12) {

        return "Good Morning";

    }

    if (currentHour < 17) {

        return "Good Afternoon";

    }

    if (currentHour < 21) {

        return "Good Evening";

    }

    return "Good Night";
}


/* =========================================
   DISPLAY PATIENT INFORMATION
========================================= */

function displayPatientInfo() {

    const greeting =
        getGreeting();


    patientGreeting.textContent =
        `${greeting}, ${patientName} 👋`;


    patientNameElement.textContent =
        patientName;


    patientAvatar.textContent =
        patientName
            .charAt(0)
            .toUpperCase();
}


displayPatientInfo();



/* =========================================
   ELEMENTS
========================================= */

const openRequestBtn =
    document.getElementById("openRequestBtn");

const requestFormSection =
    document.getElementById("requestFormSection");

const cancelRequestBtn =
    document.getElementById("cancelRequestBtn");

const emergencyForm =
    document.getElementById("emergencyForm");

const typeOptions =
    document.querySelectorAll(".type-option");

const bloodFields =
    document.getElementById("bloodFields");

const organFields =
    document.getElementById("organFields");

const requestList =
    document.getElementById("requestList");

const emptyRequestBtn =
    document.getElementById("emptyRequestBtn");

const quickRequest =
    document.getElementById("quickRequest");

const profileBtn =
    document.getElementById("profileBtn");

const quickProfile =
    document.getElementById("quickProfile");

const quickHistory =
    document.getElementById("quickHistory");

const notificationBtn =
    document.getElementById("notificationBtn");



/* =========================================
   REQUEST DATA
========================================= */

let selectedType = "blood";


let requests =
    JSON.parse(
        localStorage.getItem("lifeLinkRequests")
    ) || [];



/* =========================================
   OPEN REQUEST FORM
========================================= */

function openRequestForm() {

    requestFormSection.classList.add("show");


    requestFormSection.scrollIntoView({
        behavior: "smooth"
    });
}



/* =========================================
   CLOSE REQUEST FORM
========================================= */

function closeRequestForm() {

    requestFormSection.classList.remove("show");


    emergencyForm.reset();


    selectedType = "blood";


    bloodFields.classList.remove(
        "hidden"
    );


    organFields.classList.add(
        "hidden"
    );


    typeOptions.forEach(
        function (option) {

            option.classList.remove(
                "active"
            );

        }
    );


    typeOptions[0].classList.add(
        "active"
    );
}



/* =========================================
   OPEN FORM BUTTONS
========================================= */

openRequestBtn.addEventListener(
    "click",
    openRequestForm
);


quickRequest.addEventListener(
    "click",
    openRequestForm
);


emptyRequestBtn.addEventListener(
    "click",
    openRequestForm
);


cancelRequestBtn.addEventListener(
    "click",
    closeRequestForm
);



/* =========================================
   BLOOD / ORGAN SELECTION
========================================= */

typeOptions.forEach(
    function (option) {

        option.addEventListener(
            "click",
            function () {


                typeOptions.forEach(
                    function (item) {

                        item.classList.remove(
                            "active"
                        );

                    }
                );


                option.classList.add(
                    "active"
                );


                selectedType =
                    option.dataset.type;



                if (
                    selectedType === "blood"
                ) {

                    bloodFields.classList.remove(
                        "hidden"
                    );


                    organFields.classList.add(
                        "hidden"
                    );

                }

                else {

                    bloodFields.classList.add(
                        "hidden"
                    );


                    organFields.classList.remove(
                        "hidden"
                    );
                }

            }
        );

    }
);



/* =========================================
   SUBMIT EMERGENCY REQUEST
========================================= */

emergencyForm.addEventListener(
    "submit",
    function (event) {

        event.preventDefault();


        const hospital =
            document
                .getElementById("hospital")
                .value
                .trim();


        const location =
            document
                .getElementById("location")
                .value
                .trim();


        const priority =
            document
                .getElementById("priority")
                .value;


        const contact =
            document
                .getElementById("contact")
                .value
                .trim();


        const description =
            document
                .getElementById("description")
                .value
                .trim();



        /* COMMON VALIDATION */

        if (
            hospital === "" ||
            location === "" ||
            priority === "" ||
            contact === ""
        ) {

            alert(
                "Please fill all required fields."
            );

            return;
        }



        /* CREATE REQUEST OBJECT */

        const request = {

            id: Date.now(),

            patientName: patientName,

            type: selectedType,

            hospital: hospital,

            location: location,

            priority: priority,

            contact: contact,

            description: description,

            status: "Pending",

            acceptedDonor: null,

            createdAt:
                new Date()
                    .toLocaleDateString()

        };



        /* BLOOD REQUEST */

        if (
            selectedType === "blood"
        ) {

            const bloodGroup =
                document
                    .getElementById(
                        "bloodGroup"
                    )
                    .value;


            const units =
                document
                    .getElementById(
                        "units"
                    )
                    .value;



            if (
                bloodGroup === "" ||
                units === ""
            ) {

                alert(
                    "Please select blood group and required units."
                );

                return;
            }


            request.bloodGroup =
                bloodGroup;


            request.units =
                Number(units);

        }



        /* ORGAN REQUEST */

        else {

            const organ =
                document
                    .getElementById(
                        "organ"
                    )
                    .value;


            const medicalRequirement =
                document
                    .getElementById(
                        "medicalRequirement"
                    )
                    .value
                    .trim();



            if (organ === "") {

                alert(
                    "Please select the required organ."
                );

                return;
            }


            request.organ =
                organ;


            request.medicalRequirement =
                medicalRequirement;
        }



        /* ADD REQUEST */

        requests.push(
            request
        );



        /* SAVE REQUEST */

        localStorage.setItem(
            "lifeLinkRequests",
            JSON.stringify(
                requests
            )
        );



        /* UPDATE SCREEN */

        renderRequests();

        updateStatistics();



        alert(
            `${selectedType === "blood"
                ? "Blood"
                : "Organ"} emergency request created successfully!`
        );


        closeRequestForm();

    }
);



/* =========================================
   DISPLAY REQUESTS
========================================= */

function renderRequests() {


    if (
        requests.length === 0
    ) {

        requestList.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    🩸 🫀
                </div>

                <h3>
                    No Emergency Requests
                </h3>

                <p>
                    You haven't raised any blood or organ
                    emergency requests yet.
                </p>

                <button id="emptyRequestBtn">
                    Raise Your First Request
                </button>

            </div>
        `;


        document
            .getElementById(
                "emptyRequestBtn"
            )
            .addEventListener(
                "click",
                openRequestForm
            );


        return;
    }



    requestList.innerHTML = "";



    requests.forEach(
        function (request) {


            const icon =
                request.type === "blood"
                    ? "🩸"
                    : "🫀";


            const title =
                request.type === "blood"
                    ? `${request.bloodGroup} Blood`
                    : request.organ;


            const extraInfo =
                request.type === "blood"
                    ? `${request.units} unit(s)`
                    : "Organ request";


            let statusClass =
                "status-pending";


            if (
                request.status === "Accepted"
            ) {

                statusClass =
                    "status-accepted";

            }

            else if (
                request.status === "Completed"
            ) {

                statusClass =
                    "status-completed";
            }



            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "request-card";


            card.innerHTML = `

                <div class="request-left">

                    <div class="request-type-icon">
                        ${icon}
                    </div>


                    <div>

                        <h3>
                            ${title}
                        </h3>


                        <p>
                            ${extraInfo}
                            &nbsp; • &nbsp;
                            ${request.hospital}
                            &nbsp; • &nbsp;
                            ${request.location}
                        </p>


                        <p>
                            Priority:
                            <strong>
                                ${request.priority}
                            </strong>

                            &nbsp; • &nbsp;

                            ${request.createdAt}
                        </p>

                    </div>

                </div>


                <span
                    class="request-status ${statusClass}">

                    ${request.status}

                </span>

            `;


            requestList.appendChild(
                card
            );

        }
    );
}



/* =========================================
   UPDATE STATISTICS
========================================= */

function updateStatistics() {


    const active =
        requests.filter(
            function (request) {

                return (
                    request.status === "Pending" ||
                    request.status === "Accepted"
                );

            }
        ).length;



    const pending =
        requests.filter(
            function (request) {

                return request.status === "Pending";

            }
        ).length;



    const completed =
        requests.filter(
            function (request) {

                return request.status === "Completed";

            }
        ).length;



    const accepted =
        requests.filter(
            function (request) {

                return request.acceptedDonor !== null;

            }
        ).length;



    document
        .getElementById(
            "activeRequests"
        )
        .textContent = active;


    document
        .getElementById(
            "pendingRequests"
        )
        .textContent = pending;


    document
        .getElementById(
            "completedRequests"
        )
        .textContent = completed;


    document
        .getElementById(
            "acceptedDonors"
        )
        .textContent = accepted;
}



/* =========================================
   PROFILE
========================================= */

profileBtn.addEventListener(
    "click",
    function () {

        alert(
            "Patient Profile module will open here."
        );

    }
);


quickProfile.addEventListener(
    "click",
    function () {

        alert(
            "Patient Profile module will open here."
        );

    }
);



/* =========================================
   REQUEST HISTORY
========================================= */

quickHistory.addEventListener(
    "click",
    function () {

        document
            .querySelector(
                ".requests-section"
            )
            .scrollIntoView({
                behavior: "smooth"
            });

    }
);



/* =========================================
   NOTIFICATIONS
========================================= */

notificationBtn.addEventListener(
    "click",
    function () {

        alert(
            "No new notifications."
        );

    }
);



/* =========================================
   INITIAL LOAD
========================================= */

renderRequests();

updateStatistics();