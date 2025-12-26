/* eslint-disable no-console */
'use strict';
const omron = require('../index.js');
const assert = require('assert');

console.log('=========================================');
console.log('  Running Error Handling Tests (API Guards)');
console.log('=========================================');

// 1. requestData before start
console.log('Test 1: requestData before start...');
omron.port = null; // Ensure disconnected
// Override console.error during test
let lastError = '';
const originalError = console.error;
console.error = (msg) => { lastError = msg; };

// Case A: callback style
let callbackError = '';
omron.callback = (data, err) => { callbackError = err; };
omron.requestData();

assert.ok(callbackError && callbackError.includes('port is not found'), 'requestData should return error via callback when closed');

// Case B: no callback (console error)
omron.callback = null;
lastError = '';
omron.requestData();
assert.ok(lastError && lastError.includes('port is not found'), 'requestData should log error when no callback and closed');


// 2. settingLED before start
console.log('Test 2: settingLED before start...');
omron.port = null;
callbackError = '';
omron.callback = (data, err) => { callbackError = err; };

// Need to await? No, requestData/settingLED are async/sync mix but without port they return immediately.
// settingLED is async function.
(async () => {
    try {
        await omron.settingLED({});
        assert.ok(callbackError && callbackError.includes('port is not found'), 'settingLED should return error via callback when closed');

        // Case B: no callback
        omron.callback = null;
        lastError = '';
        await omron.settingLED({});
        assert.ok(lastError && lastError.includes('port is not found'), 'settingLED should log error when no callback and closed');

        console.log('All Error Handling Tests Passed.');
        console.error = originalError; // Restore
        process.exit(0);
    } catch (e) {
        console.error = originalError;
        console.error('FAILED:', e);
        process.exit(1);
    }
})();
