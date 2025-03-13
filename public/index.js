// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM Elements
const activeBrokersEl = document.getElementById('activeBrokers');
const totalMessagesEl = document.getElementById('totalMessages');
const responseRateEl = document.getElementById('responseRate');
const emailReportBtn = document.getElementById('emailReport');

// Load stats
async function loadStats() {
    try {
        // Get active brokers count
        const { data: brokers, error: brokersError } = await supabase
            .from('brokers')
            .select('*')
            .eq('active', true);
        
        if (brokersError) throw brokersError;
        activeBrokersEl.textContent = brokers.length;

        // Get messages from the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: messages, error: messagesError } = await supabase
            .from('conversations')
            .select('*')
            .gte('created_at', thirtyDaysAgo.toISOString());

        if (messagesError) throw messagesError;
        totalMessagesEl.textContent = messages.length;

        // Calculate response rate
        const totalIncoming = messages.filter(m => m.user_message).length;
        const totalResponses = messages.filter(m => m.ai_response).length;
        const rate = totalIncoming ? Math.round((totalResponses / totalIncoming) * 100) : 0;
        responseRateEl.textContent = `${rate}%`;

    } catch (error) {
        console.error('Error loading stats:', error);
        activeBrokersEl.textContent = 'Error';
        totalMessagesEl.textContent = 'Error';
        responseRateEl.textContent = 'Error';
    }
}

// Send email report
async function sendEmailReport() {
    try {
        // Disable button and show loading state
        emailReportBtn.disabled = true;
        emailReportBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...';
        
        // Get all necessary data for the report
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Get brokers
        const { data: brokers, error: brokersError } = await supabase
            .from('brokers')
            .select('*');
        
        if (brokersError) throw brokersError;
        
        // Get messages
        const { data: messages, error: messagesError } = await supabase
            .from('conversations')
            .select('*')
            .gte('created_at', thirtyDaysAgo.toISOString());
        
        if (messagesError) throw messagesError;
        
        // Send the report
        const response = await fetch('/api/send-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: 'Sam@purefinancialfunding.com',
                subject: 'Monthly AI Texter Report',
                data: {
                    totalBrokers: brokers.length,
                    activeBrokers: brokers.filter(b => b.active).length,
                    totalMessages: messages.length,
                    responseRate: calculateResponseRate(messages),
                    messagesByBroker: groupMessagesByBroker(messages, brokers),
                    messageCosts: calculateCosts(messages)
                }
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Show success message
            alert('Report sent successfully to Sam@purefinancialfunding.com');
        } else {
            throw new Error(result.error || 'Failed to send report');
        }
    } catch (error) {
        console.error('Error sending report:', error);
        alert('Failed to send report: ' + error.message);
    } finally {
        // Reset button state
        emailReportBtn.disabled = false;
        emailReportBtn.innerHTML = '<i class="bi bi-envelope"></i> Email Report to Sam';
    }
}

// Helper functions for report data
function calculateResponseRate(messages) {
    const totalIncoming = messages.filter(m => m.user_message).length;
    const totalResponses = messages.filter(m => m.ai_response).length;
    return totalIncoming ? Math.round((totalResponses / totalIncoming) * 100) : 0;
}

function groupMessagesByBroker(messages, brokers) {
    // Create a map of broker emails to broker names
    const brokerMap = {};
    brokers.forEach(broker => {
        brokerMap[broker.email.toLowerCase()] = broker.name;
    });
    
    // Group messages by broker
    const groupedMessages = {};
    messages.forEach(message => {
        const brokerEmail = message.broker_email.toLowerCase();
        const brokerName = brokerMap[brokerEmail] || 'Unknown Broker';
        
        if (!groupedMessages[brokerName]) {
            groupedMessages[brokerName] = {
                total: 0,
                incoming: 0,
                outgoing: 0
            };
        }
        
        groupedMessages[brokerName].total++;
        
        if (message.user_message) {
            groupedMessages[brokerName].incoming++;
        }
        
        if (message.ai_response) {
            groupedMessages[brokerName].outgoing++;
        }
    });
    
    return groupedMessages;
}

function calculateCosts(messages) {
    // Assuming $0.01 per message for API costs
    const totalOutgoing = messages.filter(m => m.ai_response).length;
    return {
        total: totalOutgoing * 0.01,
        perMessage: 0.01
    };
}

// Event listeners
emailReportBtn.addEventListener('click', sendEmailReport);

// Load stats on page load
loadStats(); 