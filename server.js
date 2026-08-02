require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = process.env.PORT || 5050;

app.use(express.json());


// ==========================================
// SUPABASE
// ==========================================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);


// ==========================================
// HTTP
// ==========================================

app.get("/", (req, res) => {
    res.send("Placement Live Server is running!");
});


// ==========================================
// WEBSOCKET
// ==========================================

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server,
    path: "/ws"
});

const clients = new Set();

function broadcast(message) {

    const data = JSON.stringify(message);

    let sent = 0;

    clients.forEach((client) => {

        if (client.readyState === WebSocket.OPEN) {

            client.send(data);
            sent++;

        }

    });

    console.log(`Live update sent to ${sent} dashboard(s)`);

}

wss.on("connection", (socket) => {

    console.log("Dashboard connected");

    clients.add(socket);

    socket.on("close", () => {

        console.log("Dashboard disconnected");

        clients.delete(socket);

    });

    socket.on("error", (error) => {

        console.error("WebSocket error:", error);

        clients.delete(socket);

    });

});


// ==========================================
// GOOGLE SHEET → SUPABASE
// ==========================================
function normalizeDate(value) {

    if (!value) {
        return null;
    }

    // Already a Date object
    if (value instanceof Date && !isNaN(value)) {
        return value.toISOString().split("T")[0];
    }

    const date = String(value).trim();

    // DD-MM-YYYY
    const match = date.match(/^(\d{2})-(\d{2})-(\d{4})$/);

    if (match) {

        const [, day, month, year] = match;

        return `${year}-${month}-${day}`;

    }

    // DD/MM/YYYY
    const slashMatch =
        date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

    if (slashMatch) {

        const [, day, month, year] = slashMatch;

        return `${year}-${month}-${day}`;

    }

    // Already YYYY-MM-DD
    if (
        /^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {

        return date;

    }

    console.warn(
        "Invalid DOB:",
        value
    );

    return null;
}


function normalizeNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return null;

    }

    const number = Number(value);

    if (Number.isNaN(number)) {

        return null;

    }

    return number;
}

app.post("/api/google-sheet/update", async (req, res) => {

    try {

        const student = req.body;

        console.log("Google Sheet update received:");
        console.log(student);


        // ==========================================
        // 1. IGNORE STUDENTS NOT INTERESTED
        // ==========================================

        const status = String(student.status || "")
            .trim()
            .toUpperCase();

        if (
            status === "NOT INTERESTED" ||
            status === "NOT_INTRESTED" ||
            status === "NOT PARTICIPATING" ||
            status === "NOT_PARTICIPATING"
        ) {

            console.log(
                `Ignoring student ${student.roll_no} - not interested`
            );

            return res.json({
                success: true,
                ignored: true,
                message: "Student is not interested"
            });

        }


        // ==========================================
        // 2. VALIDATE ROLL NUMBER
        // ==========================================

        if (!student.roll_no) {

            return res.status(400).json({
                success: false,
                message: "roll_no is required"
            });

        }


        // ==========================================
        // 3. DETERMINE PLACEMENT STATUS
        // ==========================================

        let placementStatus = "UNPLACED";

        if (status === "PLACED") {
            placementStatus = "PLACED";
        }


        // ==========================================
        // 4. PREPARE SUPABASE DATA
        // ==========================================

        const studentData = {

            roll_no: String(student.roll_no).trim(),

            register_no: String(student.roll_no).trim(),

            name: student.name || "Unknown",

            email:
                student.domain_email ||
                student.personal_email ||
                `${student.roll_no}@placeholder.local`,

            phone: student.mobile || null,

            department:
                student.department || "CSE",

            section:
                student.section || null,

            gender:
                student.gender || null,

            dob:
                normalizeDate(student.dob),

            tenth_percentage:
                normalizeNumber(student.tenth_percentage),

            twelfth_percentage:
                normalizeNumber(student.twelfth_percentage),

            cgpa:
                normalizeNumber(student.cgpa),
            diploma:
                student.diploma !== null &&
                student.diploma !== undefined &&
                student.diploma !== ""
                    ? String(student.diploma)
                    : null,

            cgpa:
                student.cgpa !== "" &&
                student.cgpa != null
                    ? Number(student.cgpa)
                    : null,

            personal_email:
                student.personal_email || null,

            resume_url:
                student.resume || null,

            address:
                student.address || null,

            interest_domain:
                student.domain || null,

            placement_status: placementStatus
        };


        console.log("Data going to Supabase:");
        console.log(studentData);


        // ==========================================
        // 5. UPSERT INTO SUPABASE
        // ==========================================

        const { data, error } = await supabase

            .from("students")

            .upsert(
                studentData,
                {
                    onConflict: "roll_no"
                }
            )

            .select()

            .single();


        if (error) {

            console.error(
                "Supabase upsert error:",
                error
            );

            return res.status(500).json({

                success: false,

                message: "Supabase update failed",

                error: error.message

            });

        }


        console.log(
            "Supabase student saved:"
        );

        console.log(data);


        // ==========================================
        // 6. SEND LIVE UPDATE TO DASHBOARD
        // ==========================================

        const message = JSON.stringify({

            type: "STUDENT_UPDATED",

            data: data

        });


        let sent = 0;


        clients.forEach((client) => {

            if (
                client.readyState ===
                WebSocket.OPEN
            ) {

                client.send(message);

                sent++;

            }

        });


        console.log(
            `Live update sent to ${sent} dashboard(s)`
        );


        // ==========================================
        // 7. RESPONSE
        // ==========================================

        res.json({

            success: true,

            message: "Student synchronized successfully",

            student: data

        });


    } catch (error) {

        console.error(
            "Server error:",
            error
        );

        res.status(500).json({

            success: false,

            message: "Internal server error",

            error: error.message

        });

    }

});

app.post("/api/company-result/update", async (req, res) => {

    try {

        const {
            roll_no,
            name,
            gender,
            student_status,
            company,
            result,
            eliminated_round,
            batch = "2023",
            section = "B"
        } = req.body;

        console.log("Company result update received:");
        console.log(req.body);

        if (!roll_no || !company || !result) {
            return res.status(400).json({
                success: false,
                message: "roll_no, company and result are required"
            });
        }

        // Find student
        const { data: student, error: studentError } =
            await supabase
                .from("students")
                .select("id, register_no")
                .eq("register_no", roll_no)
                .maybeSingle();

        if (studentError) {
            console.error("Student lookup error:", studentError);

            return res.status(500).json({
                success: false,
                message: "Student lookup failed",
                error: studentError.message
            });
        }

        // Find company
        const { data: companyData, error: companyError } =
            await supabase
                .from("companies")
                .select("id, name")
                .ilike("name", company)
                .maybeSingle();

        if (companyError) {
            console.error("Company lookup error:", companyError);

            return res.status(500).json({
                success: false,
                message: "Company lookup failed",
                error: companyError.message
            });
        }

        const entry = {

            student_id: student?.id || null,

            register_no: roll_no,

            student_name: name,

            gender: gender || null,

            student_status: student_status || null,

            batch,

            section,

            company_id: companyData?.id || null,

            company_name: company,

            result,

            eliminated_round:
                eliminated_round !== null &&
                eliminated_round !== undefined &&
                eliminated_round !== ""
                    ? Number(eliminated_round)
                    : null
        };

        console.log("Data going to student_company_results:");
        console.log(entry);

        const { data, error } = await supabase
            .from("student_company_results")
            .upsert(
                entry,
                {
                    onConflict:
                        "register_no,company_name,batch,section"
                }
            )
            .select()
            .single();

        if (error) {

            console.error(
                "student_company_results upsert error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Database update failed",
                error: error.message
            });
        }

        console.log("Company result updated successfully");

        // Notify all connected dashboards
        broadcast({
            type: "COMPANY_RESULT_UPDATED",
            data: data
        });

        res.json({
            success: true,
            message: "Company result updated successfully",
            data
        });

    } catch (error) {

        console.error(
            "Company result server error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });

    }

});

app.post("/api/company-result/delete", async (req, res) => {

    try {

        const {
            roll_no,
            company,
            batch = "2023",
            section = "B"
        } = req.body;

        console.log("Company result delete received:");
        console.log(req.body);

        if (!roll_no || !company) {
            return res.status(400).json({
                success: false,
                message: "roll_no and company are required"
            });
        }

        const { error } = await supabase
            .from("student_company_results")
            .delete()
            .eq("register_no", roll_no)
            .eq("company_name", company)
            .eq("batch", batch)
            .eq("section", section);

        if (error) {

            console.error(
                "Company result delete error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Database delete failed",
                error: error.message
            });
        }

        console.log(
            "Company result deleted successfully"
        );

        // Notify dashboards
        broadcast({
            type: "COMPANY_RESULT_DELETED",
            data: {
                roll_no,
                company,
                batch,
                section
            }
        });

        res.json({
            success: true,
            message: "Company result deleted successfully"
        });

    } catch (error) {

        console.error(
            "Delete server error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }

});

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );

});

