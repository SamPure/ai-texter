const express = require('express');
const router = express.Router();
const aiHandler = require('../ai_handler');
const { initializeSupabase } = require('../db/supabase-client');

router.post('/', async (req, res) => {
    try {
        console.log('Raw request body:', JSON.stringify(req.body, null, 2));
        
        // Validate webhook data format
        if (!req.body?.data) {
            return res.status(400).json({ error: "Invalid webhook data format" });
        }

        console.log('Request data:', JSON.stringify(req.body.data, null, 2));
        
        // Extract fields from request
        const direction = req.body.data?.direction || "unknown";
        const phoneNumber = req.body.data?.from || req.body.data?.to;
        const message = req.body.data?.message || "No message";
        const kixieEmail = req.body.data?.email;

        console.log('Extracted values:', {
            direction,
            phoneNumber,
            message,
            kixieEmail
        });

        // Validate required fields
        if (!phoneNumber) {
            console.log('Missing phone number');
            return res.status(400).json({ error: "Missing phone number" });
        }
        
        if (!kixieEmail) {
            console.log('Missing email');
            return res.status(400).json({ error: "Missing email" });
        }

        // Look up broker by kixie_email
        const supabase = await initializeSupabase();
        const { data: broker, error: brokerError } = await supabase
            .from("brokers")
            .select("*")
            .eq("kixie_email", kixieEmail)
            .single();

        if (brokerError || !broker) {
            console.error('Broker not found:', { kixieEmail, error: brokerError });
            return res.status(404).json({ error: "Broker not found" });
        }

        console.log('Found broker:', {
            name: broker.name,
            purefinancialEmail: broker.email,
            kixieEmail: broker.kixie_email,
            phone: broker.phone_number
        });

        if (direction.toLowerCase() === "incoming") {
            // Special case for email questions
            const emailKeywords = ['email', 'e-mail', 'e mail', 'email address'];
            if (emailKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
                console.log('Email question detected, sending direct response');
                
                // Save the interaction
                await aiHandler.saveResponse(
                    phoneNumber, 
                    message, 
                    `My email is ${broker.email}`,
                    false
                );
                
                return res.json({
                    success: true,
                    response: `My email is ${broker.email}`,
                    delay: 5 // Quick response for email questions
                });
            }
            
            // Get response delay
            const delay = await aiHandler.getResponseDelay(phoneNumber, broker.phone_number, message);
            
            // Generate AI response
            const aiResponse = await aiHandler.handleAIAutoResponse(phoneNumber, kixieEmail, message, broker);
            
            // Save response
            await aiHandler.saveResponse(phoneNumber, message, aiResponse);

            // Send response back to client
            res.json({ 
                success: true,
                response: aiResponse,
                delay: delay
            });
        } else {
            // For outgoing messages, just log them
            res.json({ success: true, message: "Outgoing message logged" });
        }
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).json({ 
            error: "Internal server error",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router; 