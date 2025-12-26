/* eslint-disable no-console */
'use strict';
const omron = require('../index.js');

console.log('=========================================');
console.log('  Running LED Test (Hardware)');
console.log('=========================================');

omron.start(async (data, err) => {
    if (err) {
        if (typeof err === 'string' && err.includes('INF: port is closed.')) return;
        console.error('Error:', err);
        process.exit(1);
    }
    // Ignore sensor data for this test, just wait for connection
});

// Helper to delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    console.log('Waiting for connection...');
    await sleep(2000); // Wait for port to open

    if (!omron.port) {
        console.error('Port not open. Exiting.');
        process.exit(1);
    }

    console.log('Setting LED to RED...');
    await omron.settingLED({ red: 255, green: 0, blue: 0 });
    await sleep(2000);

    console.log('Setting LED to GREEN...');
    await omron.settingLED({ red: 0, green: 255, blue: 0 });
    await sleep(2000);

    console.log('Setting LED to BLUE...');
    await omron.settingLED({ red: 0, green: 0, blue: 255 });
    await sleep(2000);

    console.log('Turning LED OFF...');
    await omron.settingLED({ red: 0, green: 0, blue: 0 });
    await sleep(1000);

    console.log('LED Test Completed.');
    omron.stop();
    process.exit(0);
})();
