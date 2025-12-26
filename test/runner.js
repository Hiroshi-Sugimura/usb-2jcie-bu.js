const { spawnSync } = require('child_process');
const omron = require('../index.js');
const path = require('path');

// Helper to run a script
function runScript(scriptName) {
    const result = spawnSync('node', [path.join(__dirname, scriptName)], { stdio: 'inherit' });
    return result.status === 0;
}

// 1. Run Unit Tests
console.log('>>> Step 1: Running Unit Tests');
if (!runScript('unit_test.js')) {
    console.error('>>> Unit Tests FAILED. Aborting.');
    process.exit(1);
}
console.log('>>> Unit Tests PASSED.\n');

// 2. Check for USB Dongle
console.log('>>> Step 2: Checking for USB Dongle (VendorID=0590, ProductID=00D4)...');

omron.getPortList().then(portList => {
    const com = portList.filter(p => p.vendorId == '0590' && p.productId == '00D4');

    if (com.length > 0) {
        console.log(`>>> USB Dongle Found at ${com[0].path}.`);
        console.log('>>> Step 3: Running Integration Tests...\n');

        if (!runScript('integration_test.js')) {
            console.error('>>> Integration Tests FAILED.');
            process.exit(1);
        } else {
            console.log('>>> Integration Tests PASSED.');
            process.exit(0);
        }
    } else {
        console.warn('>>> USB dongle was not found (USBドングルが発見できませんでした). Skipping Integration Tests.');
        process.exit(0);
    }
}).catch(err => {
    console.error('Error checking for ports:', err);
    process.exit(1);
});
