const moment = require('moment-timezone');

// Map of area codes to timezone identifiers
const AREA_CODE_TIMEZONES = {
    // Eastern Time (UTC-5/UTC-4)
    '201': 'America/New_York', '202': 'America/New_York', '203': 'America/New_York',
    '207': 'America/New_York', '212': 'America/New_York', '215': 'America/New_York',
    '216': 'America/New_York', '301': 'America/New_York', '302': 'America/New_York',
    '304': 'America/New_York', '305': 'America/New_York', '315': 'America/New_York',
    '401': 'America/New_York', '404': 'America/New_York', '407': 'America/New_York',
    '410': 'America/New_York', '412': 'America/New_York', '419': 'America/New_York',
    '443': 'America/New_York', '484': 'America/New_York', '516': 'America/New_York',
    '561': 'America/New_York', '585': 'America/New_York', '607': 'America/New_York',
    '610': 'America/New_York', '703': 'America/New_York', '704': 'America/New_York',
    '716': 'America/New_York', '717': 'America/New_York', '757': 'America/New_York',
    '802': 'America/New_York', '803': 'America/New_York', '804': 'America/New_York',
    '813': 'America/New_York', '814': 'America/New_York', '828': 'America/New_York',
    '843': 'America/New_York', '845': 'America/New_York', '904': 'America/New_York',
    '908': 'America/New_York', '910': 'America/New_York', '917': 'America/New_York',
    '919': 'America/New_York', '954': 'America/New_York',

    // Central Time (UTC-6/UTC-5)
    '205': 'America/Chicago', '214': 'America/Chicago', '225': 'America/Chicago',
    '251': 'America/Chicago', '262': 'America/Chicago', '281': 'America/Chicago',
    '309': 'America/Chicago', '312': 'America/Chicago', '314': 'America/Chicago',
    '316': 'America/Chicago', '318': 'America/Chicago', '319': 'America/Chicago',
    '334': 'America/Chicago', '337': 'America/Chicago', '361': 'America/Chicago',
    '402': 'America/Chicago', '405': 'America/Chicago', '409': 'America/Chicago',
    '414': 'America/Chicago', '417': 'America/Chicago', '430': 'America/Chicago',
    '432': 'America/Chicago', '469': 'America/Chicago', '479': 'America/Chicago',
    '501': 'America/Chicago', '504': 'America/Chicago', '507': 'America/Chicago',
    '512': 'America/Chicago', '515': 'America/Chicago', '563': 'America/Chicago',
    '573': 'America/Chicago', '580': 'America/Chicago', '601': 'America/Chicago',
    '608': 'America/Chicago', '612': 'America/Chicago', '615': 'America/Chicago',
    '618': 'America/Chicago', '630': 'America/Chicago', '651': 'America/Chicago',
    '662': 'America/Chicago', '682': 'America/Chicago', '708': 'America/Chicago',
    '713': 'America/Chicago', '715': 'America/Chicago', '731': 'America/Chicago',
    '769': 'America/Chicago', '815': 'America/Chicago', '816': 'America/Chicago',
    '817': 'America/Chicago', '830': 'America/Chicago', '832': 'America/Chicago',
    '847': 'America/Chicago', '870': 'America/Chicago', '901': 'America/Chicago',
    '903': 'America/Chicago', '913': 'America/Chicago', '918': 'America/Chicago',
    '920': 'America/Chicago', '936': 'America/Chicago', '940': 'America/Chicago',
    '956': 'America/Chicago', '972': 'America/Chicago', '979': 'America/Chicago',

    // Mountain Time (UTC-7/UTC-6)
    '303': 'America/Denver', '307': 'America/Denver', '385': 'America/Denver',
    '406': 'America/Denver', '435': 'America/Denver', '505': 'America/Denver',
    '520': 'America/Denver', '575': 'America/Denver', '602': 'America/Denver',
    '623': 'America/Denver', '719': 'America/Denver', '720': 'America/Denver',
    '801': 'America/Denver', '915': 'America/Denver', '928': 'America/Denver',
    '970': 'America/Denver',

    // Pacific Time (UTC-8/UTC-7)
    '206': 'America/Los_Angeles', '209': 'America/Los_Angeles', '213': 'America/Los_Angeles',
    '253': 'America/Los_Angeles', '310': 'America/Los_Angeles', '323': 'America/Los_Angeles',
    '360': 'America/Los_Angeles', '408': 'America/Los_Angeles', '415': 'America/Los_Angeles',
    '425': 'America/Los_Angeles', '442': 'America/Los_Angeles', '503': 'America/Los_Angeles',
    '509': 'America/Los_Angeles', '510': 'America/Los_Angeles', '530': 'America/Los_Angeles',
    '541': 'America/Los_Angeles', '559': 'America/Los_Angeles', '562': 'America/Los_Angeles',
    '619': 'America/Los_Angeles', '626': 'America/Los_Angeles', '650': 'America/Los_Angeles',
    '657': 'America/Los_Angeles', '661': 'America/Los_Angeles', '702': 'America/Los_Angeles',
    '707': 'America/Los_Angeles', '714': 'America/Los_Angeles', '725': 'America/Los_Angeles',
    '747': 'America/Los_Angeles', '760': 'America/Los_Angeles', '775': 'America/Los_Angeles',
    '805': 'America/Los_Angeles', '818': 'America/Los_Angeles', '831': 'America/Los_Angeles',
    '858': 'America/Los_Angeles', '909': 'America/Los_Angeles', '916': 'America/Los_Angeles',
    '925': 'America/Los_Angeles', '949': 'America/Los_Angeles', '951': 'America/Los_Angeles',
    '971': 'America/Los_Angeles',

    // Alaska Time (UTC-9/UTC-8)
    '907': 'America/Anchorage',

    // Hawaii-Aleutian Time (UTC-10/UTC-9)
    '808': 'Pacific/Honolulu'
};

// Business hours configuration by timezone
const BUSINESS_HOURS = {
    default: {
        start: 9, // 9 AM
        end: 17,  // 5 PM
        daysOff: [0, 6] // Sunday and Saturday
    },
    // Custom business hours for specific timezones if needed
    'Pacific/Honolulu': {
        start: 8, // 8 AM Hawaii time
        end: 16  // 4 PM Hawaii time
    }
};

class TimezoneService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    getTimezoneFromPhone(phoneNumber) {
        try {
            // Clean phone number and get area code
            const cleanNumber = phoneNumber.replace(/\D/g, '');
            const areaCode = cleanNumber.substring(0, 3);
            
            // Get timezone from map or default to Eastern
            return AREA_CODE_TIMEZONES[areaCode] || 'America/New_York';
        } catch (error) {
            console.error('Error getting timezone from phone:', error);
            return 'America/New_York'; // Default to Eastern Time
        }
    }

    isBusinessHours(phoneNumber) {
        try {
            const cacheKey = `bh_${phoneNumber}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.value;
            }

            const timezone = this.getTimezoneFromPhone(phoneNumber);
            const now = moment().tz(timezone);
            
            // Get business hours config for timezone or default
            const config = BUSINESS_HOURS[timezone] || BUSINESS_HOURS.default;
            
            // Check if it's a business day
            const isBusinessDay = !config.daysOff.includes(now.day());
            
            // Check if current hour is within business hours
            const currentHour = now.hour();
            const isBusinessHour = currentHour >= config.start && currentHour < config.end;
            
            const result = isBusinessDay && isBusinessHour;
            
            // Cache the result
            this.cache.set(cacheKey, {
                value: result,
                timestamp: Date.now()
            });
            
            return result;
        } catch (error) {
            console.error('Error checking business hours:', error);
            return false; // Default to closed if there's an error
        }
    }

    getBusinessHoursResponse(phoneNumber) {
        try {
            const timezone = this.getTimezoneFromPhone(phoneNumber);
            const config = BUSINESS_HOURS[timezone] || BUSINESS_HOURS.default;
            const now = moment().tz(timezone);
            
            // Format business hours in local time
            const startTime = moment().tz(timezone).hour(config.start).minute(0);
            const endTime = moment().tz(timezone).hour(config.end).minute(0);
            
            const timeFormat = 'h:mm A z';
            const startFormatted = startTime.format(timeFormat);
            const endFormatted = endTime.format(timeFormat);
            
            if (config.daysOff.includes(now.day())) {
                const nextBusinessDay = this.getNextBusinessDay(now, config.daysOff);
                return `Our office is currently closed for the weekend. We will be back on ${nextBusinessDay.format('dddd')} at ${startFormatted}. Thank you for your message!`;
            }
            
            const currentHour = now.hour();
            if (currentHour < config.start) {
                return `Our office is currently closed. We will open today at ${startFormatted}. Thank you for your message!`;
            }
            
            if (currentHour >= config.end) {
                const tomorrow = moment().tz(timezone).add(1, 'day');
                if (config.daysOff.includes(tomorrow.day())) {
                    const nextBusinessDay = this.getNextBusinessDay(tomorrow, config.daysOff);
                    return `Our office is currently closed. We will be back on ${nextBusinessDay.format('dddd')} at ${startFormatted}. Thank you for your message!`;
                }
                return `Our office is currently closed. We will open tomorrow at ${startFormatted}. Thank you for your message!`;
            }
            
            return null; // Return null if within business hours
        } catch (error) {
            console.error('Error getting business hours response:', error);
            return 'Our office is currently closed. We will respond to your message during regular business hours. Thank you for your patience!';
        }
    }

    getNextBusinessDay(date, daysOff) {
        let nextDay = moment(date);
        do {
            nextDay.add(1, 'day');
        } while (daysOff.includes(nextDay.day()));
        return nextDay;
    }

    formatLocalTime(time, phoneNumber) {
        try {
            const timezone = this.getTimezoneFromPhone(phoneNumber);
            return moment(time).tz(timezone).format('YYYY-MM-DD HH:mm:ss z');
        } catch (error) {
            console.error('Error formatting local time:', error);
            return moment(time).format('YYYY-MM-DD HH:mm:ss');
        }
    }

    getCurrentLocalTime(phoneNumber) {
        try {
            const timezone = this.getTimezoneFromPhone(phoneNumber);
            return moment().tz(timezone);
        } catch (error) {
            console.error('Error getting current local time:', error);
            return moment();
        }
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = new TimezoneService(); 