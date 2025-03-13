const { getSupabase } = require('../db/supabase-client');
const timezoneService = require('../utils/timezone_utils');
const { 
    isBusinessHours, 
    getBusinessHoursResponse,
    clearMemoryCache 
} = require('../utils/helpers');
const OpenAI = require('openai');

class AIService {
    constructor() {
        this.supabase = null;
        this.openai = null;
        this.conversationCache = new Map();
        this.lastCacheClear = new Date();
        this.requestCount = 0;
        this.initializeServices().catch(error => {
            console.error('Failed to initialize AI Service:', error);
        });
        
        // Memory management interval
        setInterval(async () => {
            try {
                const memoryUsage = process.memoryUsage();
                const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
                
                if (heapUsedMB > 500 || Date.now() - this.lastCacheClear > 60 * 60 * 1000) {
                    await this.clearCache();
                }
                
                if (!this.supabase || !this.openai) {
                    await this.initializeServices();
                }
            } catch (error) {
                console.error('Error in maintenance interval:', error);
            }
        }, 5 * 60 * 1000);
    }

    async initializeServices() {
        try {
            this.supabase = await getSupabase();
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('Missing OPENAI_API_KEY environment variable');
            }
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
            console.log('✓ AI Service initialized');
        } catch (error) {
            console.error('Failed to initialize AI Service:', error);
            throw error;
        }
    }

    async clearCache() {
        try {
            this.conversationCache.clear();
            this.lastCacheClear = new Date();
            clearMemoryCache();
            timezoneService.clearCache();
            console.log('✓ AI Service cache cleared');
        } catch (error) {
            console.error('Error clearing AI Service cache:', error);
        }
    }

    async getConversationContext(phoneNumber) {
        try {
            this.requestCount++;
            
            if (!this.supabase) {
                await this.initializeServices();
            }
            
            if (this.requestCount % 1000 === 0) {
                await this.cleanupOldCache();
            }

            // Check cache
            const cached = this.conversationCache.get(phoneNumber);
            if (cached?.context && Date.now() - cached.timestamp < 5 * 60 * 1000) {
                return cached.context;
            }

            // Fetch messages with retry
            const result = await this.fetchMessagesWithRetry(phoneNumber);
            if (!result.success) {
                console.error('Failed to fetch messages:', result.error);
                return null;
            }

            const context = {
                lastInteraction: result.data[0]?.created_at,
                messageHistory: result.data.reverse(),
                preferences: await this.extractPreferences(result.data),
                sentiment: await this.analyzeSentiment(result.data),
                timezone: timezoneService.getTimezoneFromPhone(phoneNumber),
                localTime: timezoneService.getCurrentLocalTime(phoneNumber)
            };

            if (context.messageHistory?.length > 0) {
                this.conversationCache.set(phoneNumber, {
                    context,
                    timestamp: Date.now()
                });
            }
            
            return context;
        } catch (error) {
            console.error('Error in getConversationContext:', error);
            return null;
        }
    }

    async fetchMessagesWithRetry(phoneNumber, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const { data, error } = await this.supabase
                    .from('conversations')
                    .select('*')
                    .eq('phone_number', phoneNumber)
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (error) throw error;
                return { success: true, data };
            } catch (error) {
                if (i === retries - 1) return { success: false, error };
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }

    async cleanupOldCache() {
        const now = Date.now();
        for (const [key, value] of this.conversationCache.entries()) {
            if (now - value.timestamp > 30 * 60 * 1000) {
                this.conversationCache.delete(key);
            }
        }
    }

    async extractPreferences(messages) {
        const preferences = {
            propertyTypes: new Set(),
            priceRange: { min: null, max: null },
            locations: new Set(),
            amenities: new Set(),
            urgency: 'medium',
            communicationStyle: 'professional'
        };

        for (const msg of messages) {
            if (msg.user_message) {
                // Extract price ranges
                const priceMatches = msg.user_message.match(/\$(\d+)k?/g);
                if (priceMatches) {
                    priceMatches.forEach(price => {
                        const value = parseInt(price.replace(/[\$k]/g, '')) * (price.includes('k') ? 1000 : 1);
                        if (!preferences.priceRange.min || value < preferences.priceRange.min) {
                            preferences.priceRange.min = value;
                        }
                        if (!preferences.priceRange.max || value > preferences.priceRange.max) {
                            preferences.priceRange.max = value;
                        }
                    });
                }

                // Extract property types
                const propertyTypes = ['house', 'apartment', 'condo', 'townhouse'];
                propertyTypes.forEach(type => {
                    if (msg.user_message.toLowerCase().includes(type)) {
                        preferences.propertyTypes.add(type);
                    }
                });

                // Analyze communication style
                const words = msg.user_message.toLowerCase().split(/\s+/);
                const formalWords = ['please', 'thank', 'would', 'could'];
                const casualWords = ['hey', 'cool', 'yeah', 'ok'];
                
                const formalCount = words.filter(w => formalWords.includes(w)).length;
                const casualCount = words.filter(w => casualWords.includes(w)).length;
                
                preferences.communicationStyle = formalCount > casualCount ? 'formal' : 'casual';
            }
        }

        return preferences;
    }

    async analyzeSentiment(messages) {
        try {
            if (!messages.length) return { overall: 'neutral', urgency: 'medium', interest: 'moderate' };

            const recentMessages = messages.slice(-3);
            const combinedText = recentMessages
                .map(m => m.user_message || '')
                .join(' ');

            const response = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [{
                    role: "system",
                    content: "Analyze the sentiment of these messages. Return a JSON object with overall (positive/negative/neutral), urgency (high/medium/low), and interest (high/moderate/low)."
                }, {
                    role: "user",
                    content: combinedText
                }],
                temperature: 0.3,
                max_tokens: 100
            });

            const sentiment = JSON.parse(response.choices[0].message.content);
            return {
                overall: sentiment.overall || 'neutral',
                urgency: sentiment.urgency || 'medium',
                interest: sentiment.interest || 'moderate'
            };
        } catch (error) {
            console.error('Error analyzing sentiment:', error);
            return { overall: 'neutral', urgency: 'medium', interest: 'moderate' };
        }
    }

    async generateResponse(message, context) {
        try {
            // Check business hours based on the recipient's timezone
            if (!timezoneService.isBusinessHours(message.from)) {
                return timezoneService.getBusinessHoursResponse(message.from);
            }

            const brokerPersonality = await this.getBrokerPersonality(message.from);
            const responseContext = {
                role: "broker",
                personality: brokerPersonality,
                context: context,
                currentMessage: message,
                localTime: timezoneService.getCurrentLocalTime(message.from)
            };

            const response = await this.generateAIResponse(responseContext);
            await this.saveResponse(message, response, context);

            return response;
        } catch (error) {
            console.error('Error generating response:', error);
            return "I apologize, but I'm having trouble processing your request. I'll get back to you shortly.";
        }
    }

    async getBrokerPersonality(phoneNumber) {
        const timezone = timezoneService.getTimezoneFromPhone(phoneNumber);
        return {
            role: "Real Estate Professional",
            traits: ["knowledgeable", "professional", "helpful", "empathetic"],
            expertise: ["property valuation", "market trends", "negotiation", "property features"],
            communication: {
                style: "professional yet friendly",
                tone: "confident and helpful"
            },
            schedule: {
                timezone: timezone,
                businessHours: "9am-5pm " + timezone.split('/')[1],
                responseTime: "within 1 business hour"
            }
        };
    }

    async generateAIResponse(context) {
        try {
            if (!this.openai) {
                await this.initializeServices();
            }

            const systemPrompt = this.buildSystemPrompt(context);
            const messageHistory = this.formatMessageHistory(context.context?.messageHistory || []);

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messageHistory,
                    { 
                        role: "user", 
                        content: context.currentMessage.text 
                    }
                ],
                temperature: 0.7,
                max_tokens: 150
            });

            return completion.choices[0].message.content.trim();
        } catch (error) {
            console.error('Error generating AI response:', error);
            throw error;
        }
    }

    buildSystemPrompt(context) {
        const { personality, context: messageContext, localTime } = context;
        const preferences = messageContext?.preferences || {};
        const sentiment = messageContext?.sentiment || {};

        return `You are a ${personality.role} with the following traits: ${personality.traits.join(', ')}.
Your expertise includes: ${personality.expertise.join(', ')}.
Communication style: ${personality.communication.style}
Tone: ${personality.communication.tone}

Current local time for client: ${localTime.format('LLLL z')}
Business hours: ${personality.schedule.businessHours}

Client Preferences:
${JSON.stringify(preferences, null, 2)}

Current Sentiment:
${JSON.stringify(sentiment, null, 2)}

Guidelines:
1. Match the client's communication style (${preferences.communicationStyle})
2. Address their specific interests and concerns
3. Be concise but informative
4. Show expertise while remaining approachable
5. Reference local time when discussing availability or scheduling
6. Respect business hours for client's timezone (${personality.schedule.timezone})`;
    }

    formatMessageHistory(messages) {
        return messages.map(msg => ({
            role: msg.user_message ? 'user' : 'assistant',
            content: msg.user_message || msg.ai_response
        }));
    }

    async saveResponse(message, response, context) {
        try {
            if (!this.supabase) {
                await this.initializeServices();
            }

            const { error } = await this.supabase
                .from('conversations')
                .insert({
                    phone_number: message.from,
                    user_message: message.text,
                    ai_response: response,
                    context: JSON.stringify({
                        ...context,
                        localTime: timezoneService.formatLocalTime(new Date(), message.from)
                    }),
                    created_at: new Date().toISOString()
                });

            if (error) throw error;
            console.log('✓ Response saved successfully');
        } catch (error) {
            console.error('Error saving response:', error);
            throw error;
        }
    }
}

module.exports = new AIService(); 