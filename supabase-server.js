require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const cron = require('node-cron');
const fs = require('fs');
const { initializeSupabase } = require('./db/supabase-client');
const timezoneService = require('./utils/timezone_utils');
const aiHandler = require('./ai_handler');
const smsService = require('./services/sms_service');
const { clearMemoryCache } = require('./utils/helpers');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Server state
const serverState = {
    startTime: new Date(),
    lastMemoryClean: new Date(),
    requestCount: 0,
    errorCount: 0,
    activeTimezones: new Set()
};

// Log environment variables
console.log('Environment variables:');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Selected port:', port);

// Debug environment variables
if (!isProduction) {
    console.log('Environment check:');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ Set' : '✗ Not set');
    console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✓ Set' : '✗ Not set');
    console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Not set');
}

// Setup middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    serverState.requestCount++;
    
    // Clean memory every 1000 requests
    if (serverState.requestCount % 1000 === 0) {
        clearMemoryCache();
        serverState.lastMemoryClean = new Date();
    }
    
    next();
});

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Timezone tracking middleware
app.use((req, res, next) => {
    const phoneNumber = req.body?.From || req.query?.phone;
    if (phoneNumber) {
        const timezone = timezoneService.getTimezoneFromPhone(phoneNumber);
        serverState.activeTimezones.add(timezone);
    }
    next();
});

// Operating hours middleware
app.use((req, res, next) => {
    const phoneNumber = req.body?.From || req.query?.phone;
    if (!phoneNumber) {
        return next();
    }

    const timezone = timezoneService.getTimezoneFromPhone(phoneNumber);
    const now = timezoneService.getCurrentLocalTime(phoneNumber);
    const hour = now.hour();

    // Server operating hours check (7:59 AM to 11:59 PM in client's timezone)
    if (hour < 7 || (hour === 7 && now.minute() < 59) || hour >= 23 && now.minute() >= 59) {
        return res.status(503).json({
            error: 'Server not available',
            message: `Server is only available from 7:59 AM to 11:59 PM ${timezone}`,
            nextAvailableTime: timezoneService.getNextAvailableTime(phoneNumber)
        });
    }

    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
    });
});

// Static routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get('/messages', (req, res) => {
    try {
        let html = fs.readFileSync(path.join(__dirname, "public", "messages.html"), 'utf8');
        
        // Create the configuration script
        const config = {
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
        };
        
        // Replace the placeholder with actual config
        const configScript = `<script>
            window.SUPABASE_CONFIG = ${JSON.stringify(config)};
            console.log('Supabase configuration loaded:', {
                url: window.SUPABASE_CONFIG.SUPABASE_URL.substring(0, 10) + '...',
                keyLength: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY?.length
            });
        </script>`;
        
        // Replace the placeholder script
        html = html.replace(
            '<script>window.SUPABASE_CONFIG = {};</script>',
            configScript
        );
        
        res.send(html);
    } catch (error) {
        console.error('Error serving messages page:', error);
        res.status(500).send('Error loading messages page');
    }
});

// Supabase configuration endpoint
app.get('/supabase-config.js', (req, res) => {
    try {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
            throw new Error('Missing Supabase credentials');
        }
        res.json({
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
        });
        console.log('✓ Supabase configuration served');
    } catch (error) {
        console.error('❌ Error serving Supabase configuration:', error);
        res.status(500).json({
            error: 'Failed to load Supabase configuration',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// API Routes
app.get('/test', (req, res) => {
    res.json({ status: 'Server is running' });
});

app.get("/api/brokers", async (req, res) => {
    try {
        const supabase = await initializeSupabase();
        const { data, error } = await supabase
            .from("brokers")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ 
            error: isProduction ? 'Failed to fetch brokers' : error.message 
        });
    }
});

app.post("/api/brokers", async (req, res) => {
    try {
        console.log('Creating broker with data:', req.body);
        const supabase = await initializeSupabase();
        const { email, name } = req.body;
        if (!email || !name) {
            console.log('Missing required fields:', { email, name });
            return res.status(400).json({ error: "Email and name are required" });
        }

        console.log('Attempting to insert broker into database...');
        const { data, error } = await supabase
            .from("brokers")
            .insert({ email, name })
            .select()
            .single();

        if (error) {
            console.error('Supabase error creating broker:', error);
            throw error;
        }
        
        console.log('Broker created successfully:', data);
        res.status(201).json(data);
    } catch (error) {
        console.error('Broker creation failed:', {
            message: error.message,
            code: error.code,
            details: error.details
        });
        res.status(500).json({ 
            error: isProduction ? 'Failed to create broker' : error.message,
            details: error.details
        });
    }
});

// Add PATCH endpoint for updating broker status
app.patch("/api/brokers/:id", async (req, res) => {
    try {
        console.log('Updating broker status:', { id: req.params.id, ...req.body });
        const supabase = await initializeSupabase();
        const { active } = req.body;
        
        if (typeof active !== 'boolean') {
            return res.status(400).json({ error: "Active status must be a boolean" });
        }

        const { data, error } = await supabase
            .from("brokers")
            .update({ active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            console.error('Error updating broker:', error);
            throw error;
        }
        
        console.log('Broker updated successfully:', data);
        res.json(data);
    } catch (error) {
        console.error('Broker update failed:', error);
        res.status(500).json({ 
            error: isProduction ? 'Failed to update broker' : error.message 
        });
    }
});

// Add DELETE endpoint for removing brokers
app.delete("/api/brokers/:id", async (req, res) => {
    try {
        console.log('Deleting broker:', req.params.id);
        const supabase = await initializeSupabase();
        
        const { error } = await supabase
            .from("brokers")
            .delete()
            .eq('id', req.params.id);

        if (error) {
            console.error('Error deleting broker:', error);
            throw error;
        }
        
        console.log('Broker deleted successfully');
        res.json({ success: true });
    } catch (error) {
        console.error('Broker deletion failed:', error);
        res.status(500).json({ 
            error: isProduction ? 'Failed to delete broker' : error.message 
        });
    }
});

// Add a robust error handler at the top level
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`Response being sent: ${typeof data === 'object' ? JSON.stringify(data) : data}`);
    return originalSend.call(this, data);
  };
  next();
});

// Utility function to clean webhookurl
const checkAndCleanWebhookUrl = (obj) => {
    if (!obj) return null;
    
    // Check if webhookurl is in the object
    if (obj.webhookurl) {
        const original = obj.webhookurl;
        
        // Clean the URL by removing anything after a semicolon
        const cleaned = original.split(';')[0];
        
        if (original !== cleaned) {
            console.log('Fixed webhook URL:', {
                original,
                cleaned
            });
            
            // Update the object with cleaned URL
            obj.webhookurl = cleaned;
        }
    }
    
    return obj;
};

// Add middleware to clean webhook URLs
app.use((req, res, next) => {
    if (req.method === 'POST' && req.url.includes('/webhook')) {
        if (req.body && req.body.data) {
            req.body.data = checkAndCleanWebhookUrl(req.body.data);
        } else if (req.body) {
            req.body = checkAndCleanWebhookUrl(req.body);
        }
    }
    next();
});

// Function to find a broker by phone number
async function findBrokerByPhone(phoneNumber) {
    console.log('Looking up broker by phone number:', phoneNumber);
    try {
        const supabase = await initializeSupabase();
        
        // Normalize the phone number by removing any non-digit characters
        let normalizedPhone = String(phoneNumber).replace(/\D/g, '');
        
        // Create variations with and without country code
        let phoneVariations = [normalizedPhone];
        
        // Add variation with exactly 10 digits (no country code)
        if (normalizedPhone.length > 10) {
            phoneVariations.push(normalizedPhone.slice(-10));
        }
        
        // Add variation with US country code (1) + 10 digits
        if (normalizedPhone.length === 10) {
            phoneVariations.push('1' + normalizedPhone);
        }
        
        // Add more variations with +, dashes, etc. for extra querying options
        phoneVariations.push('+' + normalizedPhone);
        if (normalizedPhone.length === 10) {
            phoneVariations.push('+1' + normalizedPhone);
        }
        
        // Only keep unique variations
        phoneVariations = [...new Set(phoneVariations)];
        
        console.log('🔢 Trying these phone number variations:', phoneVariations);
        
        // First try direct matches
        for (const phoneVar of phoneVariations) {
            // Exact match with phone_number field
            const { data: brokers, error } = await supabase
                .from('brokers')
                .select('*')
                .eq('phone_number', phoneVar);
            
            if (error) {
                console.error('Error looking up broker by phone number:', error);
                continue;
            }
            
            if (brokers && brokers.length > 0) {
                console.log(`✅ Found ${brokers.length} broker(s) with exact phone match:`, phoneVar);
                return brokers[0]; // Return the first match
            }
        }
        
        // If no exact matches, try LIKE queries for partial matches
        for (const phoneVar of phoneVariations) {
            // Look for brokers where phone number contains this variation
            const { data: brokers, error } = await supabase
                .from('brokers')
                .select('*')
                .like('phone_number', `%${phoneVar.slice(-8)}%`); // Match last 8 digits
            
            if (error) {
                console.error('Error with LIKE query for phone number:', error);
                continue;
            }
            
            if (brokers && brokers.length > 0) {
                console.log(`✅ Found ${brokers.length} broker(s) with partial phone match:`, phoneVar);
                return brokers[0]; // Return the first match
            }
        }
        
        console.log('❌ No broker found with any phone number variation');
        return null;
    } catch (error) {
        console.error('Error in findBrokerByPhone:', error);
        return null;
    }
}

// Add saveConversation function before the webhook handler
// Function to save a conversation to the database
async function saveConversation(phoneNumber, userMessage, aiResponse, brokerEmail) {
    try {
        console.log('🔌 Connecting to Supabase...');
        const supabase = await initializeSupabase();
        
        console.log('🔍 Looking up broker:', brokerEmail);
        
        // Normalize the phone number
        const normalizedPhone = String(phoneNumber).replace(/\D/g, '');
        
        // Create the conversation entry
        const { data: conversation, error } = await supabase
            .from('conversations')
            .insert([{
                broker_email: brokerEmail,
                phone_number: normalizedPhone,
                user_message: userMessage,
                ai_response: aiResponse,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();
            
        if (error) {
            console.error('❌ Error saving conversation:', error);
            return null;
        }
        
        console.log('✓ Conversation saved with ID:', conversation.id);
        return conversation;
    } catch (error) {
        console.error('❌ Error in saveConversation:', error);
        return null;
    }
}

// Completely revamped webhook handler
app.post('/webhook', async (req, res) => {
    const startTime = Date.now();
    console.log('📬 WEBHOOK RECEIVED:', new Date().toISOString());
    
    try {
        // Extract and validate fields
        const data = req.body?.data || req.body || {};
        console.log('Webhook payload:', JSON.stringify(data, null, 2));
        
        // Prioritize using the broker's email from Kixie
        const kixieEmail = String(data.email || '').trim();
        
        // Extract numbers with clear labels
        const customerNumber = String(data.from || data.customernumber || data.phone || data.number || '').trim();
        const brokerNumber = String(data.to || data.businessnumber || '').trim();
        const message = String(data.message || data.text || data.content || '').trim();
        const direction = String(data.direction || '').toLowerCase();
        
        console.log('Extracted fields:', { 
            customerNumber, 
            brokerNumber, 
            message, 
            direction, 
            kixieEmail 
        });
        
        // Immediately ignore outgoing messages to prevent loops
        if (direction === 'outgoing') {
            console.log('📤 Ignoring outgoing message - direction is outgoing');
            return res.json({
                success: true,
                message: 'Outgoing message ignored'
            });
        }

        // Validate required fields
        if (!customerNumber || !message) {
            console.error('❌ Missing required fields:', { customerNumber, message });
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                missing: { customerNumber: !customerNumber, message: !message }
            });
        }

        // Look up broker using multiple methods
        let broker = null;
        
        // 1. First try by Kixie email if available
        if (kixieEmail) {
            console.log('🔍 FIRST: Looking up broker by Kixie email:', kixieEmail);
            const supabase = await initializeSupabase();
            const { data: brokerByEmail, error } = await supabase
                .from('brokers')
                .select('*')
                .ilike('email', kixieEmail);  // Use case-insensitive match
                
            if (!error && brokerByEmail && brokerByEmail.length > 0) {
                broker = brokerByEmail[0];
                console.log('✅ Found broker by Kixie email:', broker.name);
            } else {
                console.log('❌ No broker found by Kixie email:', kixieEmail);
            }
        }
        
        // 2. Try by broker's business number if no broker found by email and broker number is available
        if (!broker && brokerNumber) {
            console.log('🔍 SECOND: Looking up broker by business phone number:', brokerNumber);
            broker = await findBrokerByPhone(brokerNumber);
            if (broker) {
                console.log('✅ Found broker by business phone number:', broker.name);
            } else {
                console.log('❌ No broker found by business phone number:', brokerNumber);
            }
        }
        
        // Failed to find broker
        if (!broker) {
            console.log('❌ No broker found by any method. Email:', kixieEmail, 'Business Phone:', brokerNumber);
            return res.status(404).json({
                success: false,
                error: 'Broker not found',
                details: {
                    kixieEmail: kixieEmail || 'Not provided',
                    brokerNumber: brokerNumber || 'Not provided'
                }
            });
        }

        // Check if broker is active
        if (!broker.active) {
            console.log('⏸️ Broker is inactive, ignoring message:', broker.name);
            return res.json({
                success: true,
                message: `Message ignored - ${broker.name} is inactive`,
                broker: broker.name
            });
        }

        // Only proceed with active brokers
        console.log('🤖 Processing message for active broker:', broker.name);
        
        // Generate AI response with proper fallback
        let aiResponse;
        try {
            aiResponse = await aiHandler.generateAIResponse(message, broker);
        } catch (error) {
            console.error('❌ AI response generation failed:', error);
            aiResponse = `Hi, this is ${broker.name}'s automated assistant. Our AI system is currently unavailable. Please email ${broker.email} directly.`;
        }

        // Save conversation
        await saveConversation(customerNumber, message, aiResponse, broker.email);

        // Send SMS response via Kixie
        try {
            console.log('📱 Sending SMS response to customer:', customerNumber);
            
            // Use SMS service to send the message
            const smsResult = await smsService.sendSMS(
                customerNumber,  // to
                aiResponse,      // message
                broker.email     // brokerEmail
            );
            
            console.log('📲 SMS sending result:', smsResult);
        } catch (error) {
            console.error('❌ Failed to send SMS response:', error);
        }

        const processingTime = Date.now() - startTime;
        console.log('✅ Webhook complete:', {
            processingTime: `${processingTime}ms`,
            broker: broker.name,
            response: aiResponse
        });

        res.json({
            success: true,
            response: aiResponse,
            broker: broker.name,
            delay: 200,
            processingTime
        });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Add a webhook catch-all to handle variant URLs (like /webhook/kixie, etc.)
app.post('/webhook/*', async (req, res) => {
    console.log('📬 CATCH-ALL WEBHOOK REDIRECTING to main handler');
    // Forward to the main webhook handler
    req.url = '/webhook';
    app.handle(req, res);
});

// AI response generation function that uses aiHandler
async function generateAIResponse(message, broker) {
  try {
    // Delegate to the aiHandler for consistent implementation
    return await aiHandler.generateAIResponse(message, broker);
  } catch (error) {
    console.error('AI generation error through aiHandler:', error);
    return `Hey, having some tech issues - shoot me an email at ${broker.email || 'our support team'}`;
  }
}

// DEPRECATED: The commented implementation below is kept for reference only
// The AI handler implementation should be used everywhere for consistency
/* 
async function generateAIResponse(message, broker) {
  try {
    console.log('Generating AI response for broker:', broker.name);
    
    // Use the existing AI handler or OpenAI directly
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You're texting as ${broker.name}, a funding broker. Keep responses casual, short, and conversational. Never use emojis. Focus on getting key business details like funding needs, timelines, and business type. NEVER mention confidential information about other clients or businesses.`
        },
        { role: "user", content: message }
      ],
      max_tokens: 100
    });
    
    const aiResponse = response.choices[0].message.content.trim();
    console.log('AI response:', aiResponse);
    return aiResponse;
  } catch (error) {
    console.error('AI generation error:', error);
    return "Hey there, what can I help you with today?";
  }
}
*/

// IMPORTANT NOTE:
// All AI response generation is now centralized in aiHandler.js
// Please use aiHandler.generateAIResponse(message, broker) directly for AI text generation.
// This ensures consistent behavior, proper error handling, and easier maintenance.

// Add a new endpoint to bulk add brokers
app.post("/api/brokers/bulk", async (req, res) => {
    try {
        const supabase = await initializeSupabase();
        
        const brokers = [
            { name: 'Abe Sitt', email: 'abe@purefinancialfunding.com', kixie_email: 'abe@purefinancialfunding.com', phone_number: '17329822194' },
            { name: 'Ben Davis', email: 'ben@purefinancialfunding.com', kixie_email: 'ben@purefinancialfunding.com', phone_number: '17325513314' },
            { name: 'Eli Perl', email: 'eli@purefinancialfunding.com', kixie_email: 'eli@purefinancialfunding.com', phone_number: '17324902878' },
            { name: 'George Meyar', email: 'George@purefinancialfunding.com', kixie_email: 'George@purefinancialfunding.com', phone_number: '17328538839' },
            { name: 'Judah Kesh', email: 'judah@purefinancialfunding.com', kixie_email: 'judah@purefinancialfunding.com', phone_number: '17324902885' },
            { name: 'Max White', email: 'max@purefinancialfunding.com', kixie_email: 'max@purefinancialfunding.com', phone_number: '17328350523' },
            { name: 'Moe Russo', email: 'moe@purefinancialfunding.com', kixie_email: 'moe@purefinancialfunding.com', phone_number: '17325043300' },
            { name: 'Oliver Green', email: 'oliver@purefinancialfunding.com', kixie_email: 'oliver@purefinancialfunding.com', phone_number: '17328350524' },
            { name: 'Rachel Smith', email: 'rachel@purefinancialfunding.com', kixie_email: 'rachel@purefinancialfunding.com', phone_number: '17324902866' },
            { name: 'Sam Burnett', email: 'Sam@purefinancialfunding.com', kixie_email: 'Sam@purefinancialfunding.com', phone_number: '17324902869' }
        ];

        const { data, error } = await supabase
            .from("brokers")
            .upsert(brokers, { 
                onConflict: 'email',
                ignoreDuplicates: false
            })
            .select();

        if (error) {
            console.error('Error adding brokers:', error);
            throw error;
        }
        
        console.log('Brokers added successfully:', data);
        res.status(201).json(data);
    } catch (error) {
        console.error('Failed to add brokers:', error);
        res.status(500).json({ 
            error: isProduction ? 'Failed to add brokers' : error.message 
        });
    }
});

// Add memory cleanup cron job
cron.schedule('0 */6 * * *', () => {
    console.log('Running scheduled memory cleanup');
    clearMemoryCache();
    serverState.lastMemoryClean = new Date();
});

// Static files must be after routes
app.use(express.static(path.join(__dirname, "public")));

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    serverState.errorCount++;
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' 
            ? 'An unexpected error occurred'
            : err.message
    });
});

// Catch-all webhook handler (for alternative routes)
app.post('/webhook*', async (req, res) => {
    console.log('Catch-all webhook received at:', req.path);
    
    // Forward to the main webhook handler
    try {
        // Forward to the main webhook endpoint using the production URL
        const webhookUrl = isProduction ? 
            'https://web-production-bd2cc.up.railway.app/webhook' : 
            `http://localhost:${port}/webhook`;
            
        console.log('Forwarding to main webhook at:', webhookUrl);
        
        const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        
        if (!webhookResponse.ok) {
            throw new Error(`Webhook forwarding failed with status ${webhookResponse.status}`);
        }
        
        const responseData = await webhookResponse.json();
        res.json(responseData);
    } catch (error) {
        console.error('Catch-all webhook error:', error);
        res.status(500).json({ 
            error: "Internal server error in catch-all handler",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Add a webhook test endpoint
app.get('/test-webhook', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Webhook Test</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                    pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
                    .success { color: green; }
                    .error { color: red; }
                </style>
            </head>
            <body>
                <h1>Webhook Test</h1>
                <p>Use this form to test the webhook endpoint:</p>
                <form id="webhook-form">
                    <div>
                        <label>Phone Number:</label>
                        <input type="text" id="phone" value="1234567890" />
                    </div>
                    <div>
                        <label>Message:</label>
                        <input type="text" id="message" value="Hello, I need funding for my business" />
                    </div>
                    <div>
                        <label>Broker Email:</label>
                        <select id="email">
                            <option value="sam@purefinancialfunding.com">Sam</option>
                            <option value="rachel@purefinancialfunding.com">Rachel</option>
                            <option value="ben@purefinancialfunding.com">Ben</option>
                        </select>
                    </div>
                    <button type="submit">Send Test Webhook</button>
                </form>
                <div id="result"></div>
                <script>
                    document.getElementById('webhook-form').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const phone = document.getElementById('phone').value;
                        const message = document.getElementById('message').value;
                        const email = document.getElementById('email').value;
                        
                        document.getElementById('result').innerHTML = '<p>Sending request...</p>';
                        
                        try {
                            const response = await fetch('/webhook', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    data: {
                                        from: phone,
                                        message: message,
                                        email: email,
                                        webhookurl: 'https://example.com/webhook'
                                    }
                                })
                            });
                            
                            const data = await response.json();
                            
                            document.getElementById('result').innerHTML = 
                                '<h3 class="' + (data.success ? 'success' : 'error') + '">' +
                                (data.success ? 'Success!' : 'Error!') + 
                                '</h3>' +
                                '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                        } catch (error) {
                            document.getElementById('result').innerHTML = 
                                '<h3 class="error">Error!</h3>' +
                                '<pre>' + error.message + '</pre>';
                        }
                    });
                </script>
            </body>
        </html>
    `);
});

// Add an endpoint to retrieve conversations
app.get('/api/conversations', async (req, res) => {
    try {
        const supabase = await initializeSupabase();
        
        // Get query parameters
        const timeFilter = req.query.timeFilter || '24h';
        const search = req.query.search || '';
        const broker = req.query.broker || 'all';
        const limit = parseInt(req.query.limit) || 100;
        
        // Build the query
        let query = supabase
            .from('conversations')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        
        // Apply time filter
        const now = new Date();
        if (timeFilter === '24h') {
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            query = query.gte('created_at', yesterday.toISOString());
        } else if (timeFilter === '7d') {
            const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            query = query.gte('created_at', lastWeek.toISOString());
        } else if (timeFilter === '30d') {
            const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            query = query.gte('created_at', lastMonth.toISOString());
        }
        
        // Apply broker filter
        if (broker && broker !== 'all') {
            query = query.eq('broker_email', broker);
        }
        
        // Apply search filter
        if (search) {
            query = query.or(`user_message.ilike.%${search}%,ai_response.ilike.%${search}%`);
        }
        
        // Execute the query
        const { data, error } = await query;
        
        if (error) {
            throw error;
        }
        
        res.json({
            success: true,
            conversations: data || [],
            count: data ? data.length : 0,
            timeFilter,
            broker,
            search
        });
    } catch (error) {
        console.error('Error retrieving conversations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve conversations',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Add webhook documentation route
app.get('/webhook-docs', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "webhook-docs.html"));
});

// Add reset endpoint for development/testing
app.post('/api/reset-brokers', async (req, res) => {
    try {
        console.log('Resetting brokers table...');
        const supabase = await initializeSupabase();
        
        // Delete all existing brokers
        const { error: deleteError } = await supabase
            .from('brokers')
            .delete()
            .neq('id', 0); // Delete all records
            
        if (deleteError) {
            console.error('Error deleting brokers:', deleteError);
            throw deleteError;
        }
        
        // Add Sam's information
        const { data: sam, error: insertError } = await supabase
            .from('brokers')
            .insert({
                name: 'Sam Burnett',
                email: 'Sam@purefinancialfunding.com',
                kixie_email: 'Sam@purefinancialfunding.com',
                phone_number: '17324902869',
                active: true
            })
            .select()
            .single();
            
        if (insertError) {
            console.error('Error adding Sam:', insertError);
            throw insertError;
        }
        
        console.log('Reset completed successfully');
        res.json({ 
            message: 'Brokers reset successfully',
            sam: sam
        });
    } catch (error) {
        console.error('Reset failed:', error);
        res.status(500).json({ 
            error: 'Failed to reset brokers',
            details: error.message
        });
    }
});

// Add endpoint for sending email reports
app.post('/api/send-report', async (req, res) => {
    try {
        console.log('Generating email report for:', req.body.to);
        
        // Extract data from request
        const { to, subject, data } = req.body;
        
        if (!to || !subject || !data) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }
        
        // Connect to Supabase
        const supabase = await initializeSupabase();
        
        // Generate HTML content for the email
        const htmlContent = `
            <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
                        h1 { color: #2670e8; }
                        h2 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
                        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
                        th { background-color: #f8f9fa; }
                        .highlight { font-weight: bold; color: #2670e8; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>AI Texter - Monthly Report</h1>
                        <p>Here's your monthly AI Texter report with key metrics and statistics.</p>
                        
                        <h2>Summary</h2>
                        <table>
                            <tr>
                                <th>Metric</th>
                                <th>Value</th>
                            </tr>
                            <tr>
                                <td>Total Brokers</td>
                                <td>\${data.totalBrokers}</td>
                            </tr>
                            <tr>
                                <td>Active Brokers</td>
                                <td>\${data.activeBrokers}</td>
                            </tr>
                            <tr>
                                <td>Total Messages (30 days)</td>
                                <td>\${data.totalMessages}</td>
                            </tr>
                            <tr>
                                <td>Response Rate</td>
                                <td>\${data.responseRate}%</td>
                            </tr>
                            <tr>
                                <td>Total API Cost</td>
                                <td>$\${data.messageCosts.total.toFixed(2)}</td>
                            </tr>
                        </table>
                        
                        <h2>Messages by Broker</h2>
                        <table>
                            <tr>
                                <th>Broker</th>
                                <th>Total</th>
                                <th>Incoming</th>
                                <th>Outgoing</th>
                            </tr>
                            ${Object.entries(data.messagesByBroker).map(([broker, stats]) => `
                                <tr>
                                    <td>${broker}</td>
                                    <td>${stats.total}</td>
                                    <td>${stats.incoming}</td>
                                    <td>${stats.outgoing}</td>
                                </tr>
                            `).join('')}
                        </table>
                        
                        <p>This report was generated automatically by the AI Texter system.</p>
                    </div>
                </body>
            </html>
        `;
        
        // Store the report in the database for record-keeping
        await supabase
            .from('email_reports')
            .insert({
                recipient: to,
                subject,
                content: htmlContent,
                created_at: new Date().toISOString()
            })
            .catch(err => console.error('Failed to save report to database:', err));
        
        // In a real implementation, you would use a service like SendGrid, Mailgun, etc.
        // For now, we'll simulate sending an email
        console.log(`Email report would be sent to ${to} with subject: ${subject}`);
        
        // Send response
        res.json({
            success: true,
            message: `Report generated and would be sent to ${to}`
        });
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate report',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Add admin endpoint to resend a message to a specific phone number
app.post('/api/admin/resend', async (req, res) => {
    try {
        console.log('Admin requested to resend a message:', req.body);
        
        const { phoneNumber, brokerId, message } = req.body;
        
        if (!phoneNumber || !brokerId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: phoneNumber and brokerId are required'
            });
        }
        
        // Normalize phone number
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        if (normalizedPhone.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format'
            });
        }
        
        // Connect to Supabase
        console.log('🔌 Connecting to Supabase for admin resend...');
        const supabase = await initializeSupabase();
        
        // Lookup broker
        console.log('🔍 Looking up broker for admin resend:', brokerId);
        const { data: broker, error: brokerError } = await supabase
            .from('brokers')
            .select('*')
            .eq('id', brokerId)
            .single();
        
        if (brokerError || !broker) {
            console.error('❌ Broker not found for admin resend:', { brokerId, error: brokerError });
            return res.status(404).json({
                success: false,
                error: 'Broker not found',
                details: brokerError?.message
            });
        }
        
        // Use the last message or a default if not provided
        const textToRespond = message || 'Hello, just following up on our conversation. Let me know if you have any questions!';
        
        // If no message provided, try to find the last conversation
        if (!message) {
            const { data: lastConv, error: convError } = await supabase
                .from('conversations')
                .select('*')
                .eq('phone_number', normalizedPhone)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
                
            if (!convError && lastConv) {
                console.log('Found last conversation:', lastConv);
            }
        }
        
        // Log the attempt
        console.log('🔍 ADMIN RESEND: Attempting to resend to:', { 
            phoneNumber: normalizedPhone,
            broker: broker.name,
            message: textToRespond
        });
        
        // Save conversation entry for the manual resend
        const { data: savedConversation, error: saveError } = await supabase
            .from('conversations')
            .insert([{
                broker_email: broker.email,
                phone_number: normalizedPhone,
                user_message: null, // No user message for a manual resend
                ai_response: textToRespond,
                created_at: new Date().toISOString(),
                is_manual_resend: true
            }])
            .select()
            .single();
            
        if (saveError) {
            console.error('❌ Error saving manual resend conversation:', saveError);
        } else {
            console.log('✓ Manual resend conversation saved with ID:', savedConversation.id);
        }
        
        // Here we would integrate with actual SMS provider like Twilio or similar
        // For now we'll just log the attempt
        
        // Send response
        return res.json({
            success: true,
            message: 'Manual message resend initiated',
            details: {
                phoneNumber: normalizedPhone,
                broker: broker.name,
                message: textToRespond,
                conversationId: savedConversation?.id
            }
        });
    } catch (error) {
        console.error('❌ Admin resend error:', error);
        res.status(500).json({ 
            error: "Internal server error during admin resend",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Webhook test endpoint
app.get('/api/test-webhook', (req, res) => {
    res.json({
        success: true,
        message: 'Webhook test endpoint is working',
        timestamp: new Date().toISOString(),
        server: {
            uptime: Math.floor((new Date() - serverState.startTime) / 1000),
            requests: serverState.requestCount,
            errors: serverState.errorCount
        }
    });
});

// Add diagnostic endpoint to list all brokers for debugging
app.get('/api/brokers/debug', async (req, res) => {
    try {
        console.log('Retrieving all brokers for debugging');
        const supabase = await initializeSupabase();
        
        const { data, error } = await supabase
            .from('brokers')
            .select('id, name, email, phone_number, active')
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching brokers:', error);
            throw error;
        }
        
        console.log(`Found ${data.length} brokers:`);
        data.forEach(broker => {
            console.log(`- ${broker.name} (${broker.phone_number}): ${broker.active ? 'ACTIVE' : 'INACTIVE'}`);
        });
        
        res.json({
            success: true,
            count: data.length,
            brokers: data
        });
    } catch (error) {
        console.error('Debug endpoint failed:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve brokers',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log(`✨ Server running at http://0.0.0.0:${port}`);
    console.log('✓ Timezone service initialized');
    console.log(`✓ Server operating hours: 7:59 AM to 11:59 PM (client timezone)`);
    console.log(`✓ Business hours: 9 AM to 5 PM (client timezone)`);
});
