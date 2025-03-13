const http = require('http');

function checkServer() {
    const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/test',
        method: 'GET',
        timeout: 5000
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] Server Status: ✓ Running (${res.statusCode})`);
        });
    });

    req.on('error', (error) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] Server Status: ✗ Error - ${error.message}`);
    });

    req.on('timeout', () => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] Server Status: ⚠ Timeout - Server not responding`);
    });

    req.end();
}

// Check immediately
checkServer();

// Then check every 30 seconds
setInterval(checkServer, 30000); 