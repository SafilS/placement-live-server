const express = require("express");

const app = express();

const PORT = process.env.PORT || 5050;

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Placement Live Server is running!");
});

app.post("/api/google-sheet/update", (req, res) => {

    console.log("🔥🔥🔥 WEBHOOK HIT 🔥🔥🔥");
    console.log("Received data:", JSON.stringify(req.body));

    res.status(200).json({
        success: true,
        message: "Webhook received by Render"
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});