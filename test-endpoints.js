require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
let testBrokerId;

async function testBrokerEndpoints() {
    console.log('Starting broker endpoints test...\n');

    try {
        // Test POST /brokers (Create)
        console.log('Testing broker creation...');
        const createResponse = await axios.post(`${BASE_URL}/brokers`, {
            email: `test${Date.now()}@example.com`,
            name: 'Test Broker'
        });
        testBrokerId = createResponse.data.id;
        console.log('✅ Broker created successfully:', createResponse.data);

        // Test GET /brokers (List)
        console.log('\nTesting broker listing...');
        const listResponse = await axios.get(`${BASE_URL}/brokers`);
        console.log('✅ Brokers listed successfully. Count:', listResponse.data.length);

        // Test PATCH /brokers/:id (Update)
        console.log('\nTesting broker status update...');
        const updateResponse = await axios.patch(`${BASE_URL}/brokers/${testBrokerId}`, {
            active: false
        });
        console.log('✅ Broker status updated successfully:', updateResponse.data);

        // Test DELETE /brokers/:id (Delete)
        console.log('\nTesting broker deletion...');
        await axios.delete(`${BASE_URL}/brokers/${testBrokerId}`);
        console.log('✅ Broker deleted successfully');

        console.log('\n🎉 All tests passed successfully!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

testBrokerEndpoints(); 