const axios = require('axios');

class SMSService {
    constructor() {
        this.apiKey = process.env.KIXIE_API_KEY;
        this.businessId = process.env.KIXIE_BUSINESS_ID;
        this.defaultFromNumber = process.env.KIXIE_DEFAULT_FROM;
        
        console.log('SMS service initialized with:', {
            apiKey: this.apiKey ? '✓ Set' : '✗ Not set',
            businessId: this.businessId ? '✓ Set' : '✗ Not set',
            defaultFromNumber: this.defaultFromNumber ? '✓ Set' : '✗ Not set'
        });
    }

    async sendSMS(to, message, brokerEmail) {
        try {
            const payload = {
                businessId: this.businessId,
                email: brokerEmail,
                target: to,
                eventname: 'sms',
                message: message
            };

            const response = await axios.post('https://apig.kixie.com/app/event', payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return {
                success: true,
                messageId: response.data?.messageId,
                recipient: to
            };
        } catch (error) {
            console.error('SMS sending error:', error.response?.data || error.message);
            throw new Error(`Failed to send SMS: ${error.message}`);
        }
    }
}

module.exports = new SMSService(); 