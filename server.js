const express = require("express");

const app = express();

const PORT = process.env.PORT || 5050;

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Placement Live Server is running!");
});

app.post("/api/google-sheet/update", (req, res) => {

    console.log("Google Sheet update received:");
    console.log(req.body);

    res.json({
        success: true,
        message: "Google Sheet update received successfully"
    });

});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});