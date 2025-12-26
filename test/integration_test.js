/* eslint-disable no-console */
'use strict';
const omron = require('../index.js');
const assert = require('assert');

console.log('=========================================');
console.log('  Running Integration Test (Hardware)');
console.log('=========================================');

const timeout = setTimeout(() => {
    console.error('TIMEOUT: No data received within 5 seconds.');
    omron.stop();
    process.exit(1);
}, 5000);

omron.start((data, err) => {
    if (err) {
        // "INF: port is closed." is expected on stop
        if (typeof err === 'string' && err.includes('INF: port is closed.')) {
            return;
        }

        console.error('Error received in callback:', err);
        if (typeof err === 'string' && err.includes('Error')) {
            clearTimeout(timeout);
            process.exit(1);
        }
        return;
    }

    if (data) {
        console.log('Data received successfully.');
        console.log('--- Sensor Values ---');
        console.dir(data);
        console.log('---------------------');

        try {
            assert.ok(typeof data.temperature === 'number', 'Temperature should be a number');
            assert.ok(typeof data.humidity === 'number', 'Humidity should be a number');
            console.log('Assertions Passed: Data format is valid.');
        } catch (e) {
            console.error('Assertion Failed:', e);
            omron.stop();
            process.exit(1);
        }

        console.log('Stopping sensor...');
        omron.stop();
        clearTimeout(timeout);
        setTimeout(() => {
            console.log('Integration Test Completed Successfully.');
            process.exit(0);
        }, 500);
    }
}, { debug: true }); // Enable debug to see more logs if needed

// Give a little time for connection to be established before requesting
setTimeout(() => {
    console.log('Requesting data from sensor...');
    omron.requestData();
}, 1500);
