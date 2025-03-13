// Date and time utilities
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getDateRange(range) {
    const end = new Date();
    const start = new Date();

    switch (range) {
        case '24h':
            start.setHours(start.getHours() - 24);
            break;
        case '7d':
            start.setDate(start.getDate() - 7);
            break;
        case '30d':
            start.setDate(start.getDate() - 30);
            break;
        case 'all':
            start.setFullYear(start.getFullYear() - 10);
            break;
        default:
            start.setHours(start.getHours() - 24);
    }

    return { start, end };
}

// Phone number formatting
function formatPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    const match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/);
    if (match) {
        const intlCode = match[1] ? '+1 ' : '';
        return [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('');
    }
    return phoneNumber;
}

// Message processing
function extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

function extractPhoneNumbers(text) {
    const phoneRegex = /(\+?1?\s*\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g;
    return text.match(phoneRegex) || [];
}

function extractEmails(text) {
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g;
    return text.match(emailRegex) || [];
}

// Error handling
function handleError(error, defaultMessage = 'An error occurred') {
    console.error('Error:', error);
    return {
        message: process.env.NODE_ENV === 'development' ? error.message : defaultMessage,
        status: error.status || 500,
        code: error.code || 'INTERNAL_ERROR'
    };
}

// Response formatting
function formatResponse(data, message = 'Success') {
    return {
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    };
}

// Validation
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhoneNumber(phone) {
    const re = /^\+?1?\d{10}$/;
    return re.test(phone.replace(/\D/g, ''));
}

// Time zone and business hours management
function isBusinessHours(timezone = 'America/New_York') {
    const now = new Date().toLocaleString('en-US', { timeZone: timezone });
    const hour = new Date(now).getHours();
    const day = new Date(now).getDay();
    
    // Monday-Friday, 9am-5pm
    return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

function getBusinessHoursResponse(timezone = 'America/New_York') {
    const now = new Date().toLocaleString('en-US', { timeZone: timezone });
    const hour = new Date(now).getHours();
    const day = new Date(now).getDay();
    
    if (day === 0 || day === 6) {
        return "Thank you for your message. Our office is closed for the weekend. I'll respond to your inquiry first thing Monday morning. For urgent matters, please call our 24/7 emergency line.";
    }
    
    if (hour < 9) {
        return "Good morning! Our office opens at 9am. I'll respond to your message as soon as we open. For urgent matters, please call our 24/7 emergency line.";
    }
    
    if (hour >= 17) {
        return "Thank you for your message. Our office is now closed for the day. I'll respond to your inquiry first thing tomorrow morning. For urgent matters, please call our 24/7 emergency line.";
    }
    
    return null;
}

function getServerOperatingHours() {
    const now = new Date();
    const hour = now.getHours();
    
    // Server operates 8am-11pm
    return hour >= 8 && hour < 23;
}

// Memory management
function clearMemoryCache() {
    if (global.gc) {
        global.gc();
    }
}

// Process monitoring
function getProcessStats() {
    const used = process.memoryUsage();
    return {
        heapTotal: Math.round(used.heapTotal / 1024 / 1024),
        heapUsed: Math.round(used.heapUsed / 1024 / 1024),
        external: Math.round(used.external / 1024 / 1024),
        cpu: process.cpuUsage(),
        uptime: process.uptime()
    };
}

// Export all utilities
module.exports = {
    formatDate,
    formatTime,
    getDateRange,
    formatPhoneNumber,
    extractUrls,
    extractPhoneNumbers,
    extractEmails,
    handleError,
    formatResponse,
    validateEmail,
    validatePhoneNumber,
    isBusinessHours,
    getBusinessHoursResponse,
    getServerOperatingHours,
    clearMemoryCache,
    getProcessStats
}; 