const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

const PORT = process.env.PORT || 5050;

app.use(express.json());


// ==========================================
// HTTP SERVER
// ==========================================

app.get("/", (req, res) => {
    res.send("Placement Live Server is running!");
});


// ==========================================
// CREATE HTTP SERVER
// ==========================================

const server = http.createServer(app);


// ==========================================
// WEBSOCKET SERVER
// ==========================================

const wss = new WebSocket.Server({
    server,
    path: "/ws"
});


// Connected dashboards
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
// GOOGLE SHEET WEBHOOK
// ==========================================

app.post("/api/google-sheet/update", (req, res) => {

    console.log("Google Sheet update received:");
    console.log(req.body);


    // Send update to all connected dashboards

    const message = JSON.stringify({
        type: "STUDENT_UPDATED",
        data: req.body
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
        message: "Google Sheet update received successfully"
    });

});


// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );

});