const nodemailer = require('nodemailer');
const { supabase } = require('./supabase-server');
const { CONFIG } = require('./config');

// Configure email transport for direct SMTP
const transporter = nodemailer.createTransport({
    host: "smtp.office365.com", // or your email provider's SMTP
    port: 587,
    secure: false,
    auth: {
        user: "sam@purefinancialfunding.com",
        pass: process.env.EMAIL_PASSWORD
    }
});

async function generateCostReport() {
    try {
        const now = new Date();
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

        // Get conversations from the last month
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('*')
            .gte('created_at', monthAgo.toISOString())
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Calculate metrics
        const totalMessages = conversations.length;
        const apiCost = totalMessages * 0.01; // Assuming $0.01 per message
        const avgResponseTime = calculateAverageResponseTime(conversations);

        // Generate HTML report
        const html = `
            <h2>Monthly AI-Texter Performance Report</h2>
            <p>Report for: ${monthAgo.toLocaleDateString()} - ${now.toLocaleDateString()}</p>
            
            <h3>Usage Metrics</h3>
            <ul>
                <li>Total Messages: ${totalMessages}</li>
                <li>Average Response Time: ${avgResponseTime}s</li>
            </ul>

            <h3>Cost Breakdown</h3>
            <ul>
                <li>Total API Cost: $${apiCost.toFixed(2)}</li>
                <li>Average Daily Cost: $${(apiCost / 30).toFixed(2)}</li>
            </ul>

            <p>View detailed analytics at: <a href="https://web-production-bd2cc.up.railway.app/messages">Message History Dashboard</a></p>
        `;

        return html;
    } catch (error) {
        console.error('Error generating report:', error);
        throw error;
    }
}

function calculateAverageResponseTime(conversations) {
    // Implementation would require timestamps for both receipt and response
    return 30; // Placeholder
}

async function sendMonthlyReport() {
    try {
        const html = await generateCostReport();

        const mailOptions = {
            from: "sam@purefinancialfunding.com",
            to: "sam@purefinancialfunding.com",
            subject: 'Monthly AI-Texter Performance Report',
            html: html
        };

        await transporter.sendMail(mailOptions);
        console.log('Monthly report sent successfully');
    } catch (error) {
        console.error('Error sending monthly report:', error);
    }
}

// Export for use in cron job
module.exports = { sendMonthlyReport }; 