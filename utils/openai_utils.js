require('dotenv').config();
const OpenAI = require('openai');

// Enhanced check for OpenAI API key
function validateApiKey(key) {
    if (!key) {
        console.error('⚠️ Missing OpenAI API key - AI functionality will be unavailable');
        return false;
    }
    
    // Check for placeholder or invalid keys
    if (key === 'your-api-key-here' || 
        key === 'sk-your-api-key-here' || 
        key.length < 20) {
        console.error('⚠️ Invalid OpenAI API key format - AI functionality will be unavailable');
        return false;
    }
    
    // Support both standard 'sk-' and project-based 'sk-proj-' API keys
    if (!key.startsWith('sk-')) {
        console.error('⚠️ Invalid OpenAI API key format (should start with sk-) - AI functionality will be unavailable');
        return false;
    }
    
    return true;
}

// Initialize OpenAI client
let openai = null;
const isValidKey = validateApiKey(process.env.OPENAI_API_KEY);

if (isValidKey) {
    try {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            maxRetries: 3,
            timeout: 30000
        });
        console.log('✓ OpenAI client initialized');
    } catch (error) {
        console.error('❌ Failed to initialize OpenAI client:', error.message);
    }
}

// Test the configuration
async function testConnection() {
    if (!openai) {
        throw new Error('OpenAI client not initialized');
    }
    
    try {
        const models = await openai.models.list();
        console.log('✓ OpenAI connection verified');
        return true;
    } catch (error) {
        if (error.status === 401) {
            console.error('❌ OpenAI authentication failed: Invalid API key');
        } else if (error.status === 429) {
            console.error('❌ OpenAI rate limit exceeded: Too many requests');
        } else {
            console.error('❌ OpenAI connection failed:', error.message);
        }
        throw error;
    }
}

// Export both the client and the test function
module.exports = {
    openai,
    testConnection
}; 