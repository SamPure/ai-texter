const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const FILE = "/Users/liam/.cursor-tutor/ai-texter/data.json";
const port = 3001;

app.use(cors());
app.use(express.json());
fs.writeFileSync(FILE, "[]");

app.post("/training", (e, s) => {
    try {
        const i = { conversation: e.body.conversation, timestamp: new Date().toISOString() };
        fs.writeFileSync(FILE, JSON.stringify([i], null, 2));
        console.log("Saved:", i);
        s.json({ success: true });
    } catch (i) {
        console.error(i);
        s.status(500).json({ error: i.message });
    }
});

app.get('/test', (req, res) => {
    res.json({ status: 'Server is running' });
});

app.get("/", (e, s) => s.json({ status: "ok" }));

app.listen(port, () => {
    console.log(`Test server running at http://localhost:${port}`);
});
