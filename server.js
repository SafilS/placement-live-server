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

app.post("/api/google-sheet/update", async (req, res) => {

    try {

        const student = req.body;

        console.log("Google Sheet update received:");
        console.log(student);


        if (!student.roll_no) {

            return res.status(400).json({
                success: false,
                message: "roll_no is required"
            });

        }


        // Update student in Supabase
        const { data, error } = await supabase
            .from("students")
            .update({

                name: student.name,

                placement_status: student.status,

                department: student.department,

                section: student.section,

                gender: student.gender,

                dob: student.dob || null,

                tenth_percentage:
                    student.tenth_percentage || null,

                twelfth_percentage:
                    student.twelfth_percentage || null,

                diploma:
                    student.diploma || null,

                cgpa:
                    student.cgpa || null,

                phone:
                    student.mobile || null,

                email:
                    student.domain_email,

                personal_email:
                    student.personal_email || null,

                resume_url:
                    student.resume || null,

                address:
                    student.address || null,

                interest_domain:
                    student.domain || null

            })
            .eq("roll_no", student.roll_no)
            .select()
            .single();


        if (error) {

            console.error(
                "Supabase update error:",
                error
            );

            return res.status(500).json({

                success: false,

                message: "Supabase update failed",

                error: error.message

            });

        }


        console.log(
            "Supabase student updated:",
            data
        );


        // ======================================
        // SEND UPDATE TO DASHBOARD
        // ======================================

        const message = JSON.stringify({

            type: "STUDENT_UPDATED",

            data: data

        });


        clients.forEach((client) => {

            if (client.readyState === WebSocket.OPEN) {

                client.send(message);

            }

        });


        console.log(
            `Update sent to ${clients.size} dashboard(s)`
        );


        res.json({

            success: true,

            message: "Student updated successfully",

            student: data

        });


    } catch (error) {

        console.error(
            "Server error:",
            error
        );

        res.status(500).json({

            success: false,

            message: "Internal server error"

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