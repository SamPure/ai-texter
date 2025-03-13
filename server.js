require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const app = express();
const port = process.env.PORT || 3001;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.post('/training', async (req, res) => {
    try {
        const { conversation } = req.body;
        const userMessage = conversation[conversation.length - 2]?.content || '';
        const aiResponse = conversation[conversation.length - 1]?.content || '';
        const { data, error } = await supabase.from('conversations').insert([{
            phone_number: 'training',
            broker_email: 'training@example.com',
            user_message: userMessage,
            ai_response: aiResponse,
            is_training: true,
            effectiveness: 0
        }]);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/', (req, res) => {
    res.json({ status: 'Server is running' });
});
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});
