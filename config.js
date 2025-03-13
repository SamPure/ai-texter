const CONFIG = {
  BUSINESS_ID: '42974',
  USER_PHONE_MAPPING: {
    '17329822194': 'abe@purefinancialfunding.com',
    '17325513314': 'ben@purefinancialfunding.com',
    '17324902878': 'eli@nexumadvance.com',
    '17324902885': 'judah@nexumadvance.com',
    '17328350523': 'max@purefinancialfunding.com',
    '17329822987': 'moe@purefinancialfunding.com',
    '17328350524': 'oliver@purefinancialfunding.com',
    '17324902866': 'rachel@purefinancialfunding.com',
    '17324902869': 'Sam@purefinancialfunding.com'
  }
};

const AI_CONFIG = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  KIXIE_CONFIG: {
    API_KEY: '63210a7973b9d8bb9edd4044182b3413',
    EMAIL: 'Sam@PureFinancialFunding.com'
  }
};

module.exports = { CONFIG, AI_CONFIG }; 