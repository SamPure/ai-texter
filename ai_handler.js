require('dotenv').config();
const { getSupabase } = require('./db/supabase-client');
const { openai, testConnection } = require('./utils/openai_utils');

class AIHandler {
    constructor() {
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        this.supabase = null;
        this.initialized = false;
        this.initializeServices();
    }

    async initializeServices() {
        try {
            // Check for required environment variables
            const apiKey = process.env.OPENAI_API_KEY;
            
            if (!apiKey || 
                apiKey === 'sk-your-api-key-here' || 
                !apiKey.startsWith('sk-') || 
                apiKey.length < 30) {
                console.error('⚠️ Invalid or missing OpenAI API key. Please update your .env file with a valid key.');
                // Don't proceed with initialization if API key is missing or invalid
            } else {
                // Initialize Supabase connection
                this.supabase = await getSupabase();
                
                // Test OpenAI connection if possible
                if (openai) {
                    try {
                        await testConnection();
                    } catch (openaiError) {
                        if (openaiError.status === 401) {
                            console.error('⚠️ OpenAI authentication failed. Please check your API key.');
                            // Don't proceed with initialization if authentication fails
                        } else {
                            console.warn('⚠️ OpenAI connection test error:', openaiError.message);
                            // Continue initialization despite other OpenAI errors
                            this.initialized = true;
                        }
                    }
                } else {
                    console.error('⚠️ OpenAI client not initialized. AI responses will fall back to default messages.');
                    // Continue initialization despite missing OpenAI client
                }
                
                this.initialized = true;
                console.log('✓ AI Handler initialized successfully');
            }
        } catch (error) {
            console.error('Failed to initialize services:', error);
            // Don't throw - we'll try again later
        }
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.initializeServices();
        }
        
        // Don't throw - just return false if not initialized
        // This allows fallback responses to work even when initialization fails
        return this.initialized;
    }

    async getResponseDelay(phoneNumber, businessNumber, message) {
        try {
            // Check initialization without throwing
            const isInitialized = await this.ensureInitialized();
            
            if (!isInitialized) {
                console.log('Using default delay due to initialization issues');
                return 120; // Default delay when not initialized
            }
            
            const supabase = await getSupabase();
            
            // Check for recent messages in the last 30 minutes
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
            
            const { data: recentMessages } = await supabase
                .from('conversations')
                .select('created_at')
                .eq('phone_number', phoneNumber)
                .eq('business_number', businessNumber)
                .gte('created_at', thirtyMinutesAgo.toISOString())
                .order('created_at', { ascending: false });

            if (recentMessages && recentMessages.length > 0) {
                // Ongoing conversation - delay 25-35 seconds
                return Math.floor(Math.random() * (35 - 25 + 1)) + 25;
            } else {
                // New conversation - delay 2-4 minutes to feel natural
                return Math.floor(Math.random() * (240 - 120 + 1)) + 120;
            }
        } catch (error) {
            console.error('Error checking conversation status:', error);
            return 120; // Default delay
        }
    }

    async handleAIAutoResponse(phoneNumber, kixieEmail, message, broker) {
        // Reuse the same fallback responses mechanism as generateAIResponse
        const fallbackResponses = {
            greeting: [
                "hey there, what kind of business you running?",
                "hey what's your business about?",
                "how's business going?",
                "what sort of funding are you looking for?"
            ],
            goodbye: [
                "sounds good, talk soon",
                "no problem, reach out when ready",
                "ok let me know if anything changes",
                "got it, I'm here when you need"
            ],
            statement_request: [
                "can you send over your last 4 months of bank statements?",
                "just need to see your last few months of statements",
                "shoot over those bank statements when you get a chance",
                "need your statements to get you the best options"
            ],
            default: [
                `hey shoot me an email at ${broker?.email || 'our support team'}`,
                "what's your monthly revenue looking like?",
                "how long have you been in business?",
                "how much funding are you looking for?",
                "what's the funding for specifically?"
            ]
        };

        // Function to select a random response from a category
        const getRandomResponse = (category) => {
            const responses = fallbackResponses[category] || fallbackResponses.default;
            const randomIndex = Math.floor(Math.random() * responses.length);
            return responses[randomIndex];
        };

        try {
            await this.ensureInitialized();
            
            // If not initialized or OpenAI is unavailable, use fallback responses
            if (!this.initialized || !openai) {
                console.log('Using fallback responses due to initialization issues');
                
                // Determine message type for appropriate fallback
                const lowerMessage = message.toLowerCase();
                
                // Special handling for email-related questions (high priority)
                if (lowerMessage.includes('email') || 
                    lowerMessage.includes('e-mail') || 
                    lowerMessage.includes('contact') ||
                    lowerMessage.includes('reach you')) {
                    return `My email is ${broker.email}`;
                }
                
                // Handle greetings
                if (lowerMessage.match(/^(hi|hey|hello|howdy|yo|what's up|sup|good morning|good afternoon)/)) {
                    return getRandomResponse('greeting');
                }
                
                // Handle goodbyes or rejections
                if (lowerMessage.match(/(bye|talk later|not interested|another time|not now|busy|call back|later|no thanks)/)) {
                    return getRandomResponse('goodbye');
                }
                
                // Handle bank statement related questions
                if (lowerMessage.match(/(statement|bank|document|paperwork|send|email)/)) {
                    return getRandomResponse('statement_request');
                }
                
                // Default random response
                return getRandomResponse('default');
            }
            
            console.log('🤖 Processing AI response for:', {
                broker: broker.name,
                email: broker.email,
                phone: broker?.phone_number
            });

            // Prepare system message with updated instructions
            const systemMessage = {
                role: 'system',
                content: `You are ${broker.name}, a funding specialist at Pure Financial Funding.
                
                CRITICAL RULES:
                1. Text EXACTLY like a real person - super informal
                2. ONE short sentence only
                3. We fund ALL types of businesses
                4. NO emojis or special characters
                5. NEVER mention other clients or deals
                6. NEVER discuss rates or terms
                7. NEVER mention being AI
                8. NO sharing of any client info
                9. Email is EXACTLY: "${broker.email}"
                10. PERSISTENCE: Only fully stop if user says "unsubscribe", "stop texting", or uses hostile language
                11. GOAL: Get their last 4 months of bank statements
                
                RESPONSE STYLE:
                - Text like you're messaging a friend
                - Use casual language (yeah, hey, cool, etc)
                - Keep it super short
                - For soft rejections, stay engaged and try different angles
                
                CONTEXT UNDERSTANDING:
                - Analyze tone and intent, not just keywords
                - If they seem busy, acknowledge and ask when better to chat
                - If they're hesitant, focus on how you can help their business
                - If they mention specific business needs, reference those in follow-ups
                
                PERFECT EXAMPLES:
                "yeah whats your business about"
                "how much funding you thinking about"
                "cool can you send over 4 months bank statements"
                "whats your monthly rev like"
                "k let me check what i can do"
                "send those statements when ready"
                "no rush but those statements would help me get you options"
                "when would be a better time to chat about this"`
            };

            // Add current message
            const messages = [
                systemMessage,
                {
                    role: 'user',
                    content: message
                }
            ];

            // Special handling for email-related questions
            if (message.toLowerCase().includes('email') || 
                message.toLowerCase().includes('e-mail') || 
                message.toLowerCase().includes('contact')) {
                return `My email is ${broker.email}`;
            }

            // Generate response with stricter constraints
            const completion = await openai.chat.completions.create({
                model: "gpt-4-turbo-preview",
                messages: messages,
                temperature: 0.7,  // Increased for more casual tone
                max_tokens: 25     // Very short responses
            });

            const response = completion.choices[0].message.content.trim();
            console.log('AI Response:', response);
            return response;

        } catch (error) {
            console.error('AI Response Error:', error);
            const fallbackMessage = `Hey, shoot me an email at ${broker.email}`;
            
            // Save error logs for debugging
            try {
                await this.saveResponse(phoneNumber || 'unknown', message, fallbackMessage, true);
            } catch (logError) {
                console.error('Failed to log error response:', logError);
            }
            
            return fallbackMessage;
        }
    }

    async saveResponse(phoneNumber, userMessage, aiResponse, isError = false) {
        let retries = 0;
        while (retries < this.maxRetries) {
            try {
                // Check initialization without throwing
                const isInitialized = await this.ensureInitialized();
                
                // Skip saving if not initialized
                if (!isInitialized) {
                    console.warn('Skipping database save - AI Handler not initialized');
                    return;
                }
                
                const supabase = await getSupabase();
                const { error } = await supabase
                    .from('conversations')
                    .insert({
                        phone_number: phoneNumber,
                        user_message: userMessage,
                        ai_response: aiResponse,
                        created_at: new Date().toISOString()
                    });

                if (error) throw error;
                console.log('✓ Response saved to database');
                return;
            } catch (error) {
                retries++;
                console.error(`Failed to save response (attempt ${retries}/${this.maxRetries}):`, error);
                if (retries === this.maxRetries) {
                    console.error('Failed to save response after max retries');
                    // Don't throw - just log the error
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * retries));
            }
        }
    }

    async generateAIResponse(message, broker) {
        // Default responses for common messages when OpenAI is unavailable
        const fallbackResponses = {
            greeting: [
                "hey there, what kind of business you running?",
                "hey what's your business about?",
                "how's business going?",
                "what sort of funding are you looking for?"
            ],
            goodbye: [
                "sounds good, talk soon",
                "no problem, reach out when ready",
                "ok let me know if anything changes",
                "got it, I'm here when you need"
            ],
            statement_request: [
                "can you send over your last 4 months of bank statements?",
                "just need to see your last few months of statements",
                "shoot over those bank statements when you get a chance",
                "need your statements to get you the best options"
            ],
            default: [
                `hey shoot me an email at ${broker?.email || 'our support team'}`,
                "what's your monthly revenue looking like?",
                "how long have you been in business?",
                "how much funding are you looking for?",
                "what's the funding for specifically?"
            ]
        };

        // Function to select a random response from a category
        const getRandomResponse = (category) => {
            const responses = fallbackResponses[category] || fallbackResponses.default;
            const randomIndex = Math.floor(Math.random() * responses.length);
            return responses[randomIndex];
        };

        // Helper function to get context-specific fallback
        const getFallbackResponse = (message) => {
            const lowerMessage = message.toLowerCase();
            
            // Special handling for email-related questions (high priority)
            if (lowerMessage.includes('email') || 
                lowerMessage.includes('e-mail') || 
                lowerMessage.includes('contact') ||
                lowerMessage.includes('reach you')) {
                return `My email is ${broker.email}`;
            }
            
            // Handle greetings
            if (lowerMessage.match(/^(hi|hey|hello|howdy|yo|what's up|sup|good morning|good afternoon)/)) {
                return getRandomResponse('greeting');
            }
            
            // Handle goodbyes or rejections
            if (lowerMessage.match(/(bye|talk later|not interested|another time|not now|busy|call back|later|no thanks)/)) {
                return getRandomResponse('goodbye');
            }
            
            // Handle bank statement related questions
            if (lowerMessage.match(/(statement|bank|document|paperwork|send|email)/)) {
                return getRandomResponse('statement_request');
            }
            
            // Default random response
            return getRandomResponse('default');
        };

        try {
            // Check initialization without throwing
            const isInitialized = await this.ensureInitialized();
            
            // If not initialized or OpenAI is unavailable, use fallback responses
            if (!isInitialized || !openai) {
                console.log('Using fallback responses due to initialization issues');
                const fallback = getFallbackResponse(message);
                console.log('Generated fallback response:', fallback);
                return fallback;
            }
            
            // Check for invalid API key - updated to handle project-based API keys
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey || 
                apiKey === 'sk-your-api-key-here' ||
                !apiKey.startsWith('sk-') ||
                apiKey.length < 30) {
                console.log('Invalid API key format detected, using fallback responses');
                const fallback = getFallbackResponse(message);
                console.log('Generated fallback response:', fallback);
                return fallback;
            }
            
            console.log('🤖 Processing AI response for:', {
                broker: broker.name,
                email: broker.email,
                phone: broker?.phone_number
            });

            // Prepare system message with updated instructions
            const systemMessage = {
                role: 'system',
                content: `You are ${broker.name}, a funding specialist at Pure Financial Funding.
                
                CRITICAL RULES:
                1. Text EXACTLY like a real person - super informal
                2. ONE short sentence only
                3. We fund ALL types of businesses
                4. NO emojis or special characters
                5. NEVER mention other clients or deals
                6. NEVER discuss rates or terms
                7. NEVER mention being AI
                8. NO sharing of any client info
                9. Email is EXACTLY: "${broker.email}"
                10. PERSISTENCE: Only fully stop if user says "unsubscribe", "stop texting", or uses hostile language
                11. GOAL: Get their last 4 months of bank statements
                
                RESPONSE STYLE:
                - Text like you're messaging a friend
                - Use casual language (yeah, hey, cool, etc)
                - Keep it super short
                - For soft rejections, stay engaged and try different angles
                
                CONTEXT UNDERSTANDING:
                - Analyze tone and intent, not just keywords
                - If they seem busy, acknowledge and ask when better to chat
                - If they're hesitant, focus on how you can help their business
                - If they mention specific business needs, reference those in follow-ups
                
                PERFECT EXAMPLES:
                "yeah whats your business about"
                "how much funding you thinking about"
                "cool can you send over 4 months bank statements"
                "whats your monthly rev like"
                "k let me check what i can do"
                "send those statements when ready"
                "no rush but those statements would help me get you options"
                "when would be a better time to chat about this"`
            };

            // Add current message
            const messages = [
                systemMessage,
                {
                    role: 'user',
                    content: message
                }
            ];

            // Special handling for email-related questions
            if (message.toLowerCase().includes('email') || 
                message.toLowerCase().includes('e-mail') || 
                message.toLowerCase().includes('contact')) {
                return `My email is ${broker.email}`;
            }

            // Generate response with stricter constraints
            const completion = await openai.chat.completions.create({
                model: "gpt-4-turbo-preview",
                messages: messages,
                temperature: 0.7,  // Increased for more casual tone
                max_tokens: 25     // Very short responses
            });

            const response = completion.choices[0].message.content.trim();
            console.log('AI Response:', response);
            return response;

        } catch (error) {
            console.error('AI Response Error:', error);
            const fallbackMessage = `Hey, shoot me an email at ${broker.email}`;
            
            // Save error logs for debugging
            try {
                await this.saveResponse(broker?.phone_number || 'unknown', message, fallbackMessage, true);
            } catch (logError) {
                console.error('Failed to log error response:', logError);
            }
            
            return fallbackMessage;
        }
    }
}

// Export singleton instance
const aiHandler = new AIHandler();
module.exports = aiHandler; 