const assert = require('assert');
const omron = require('../index.js');

console.log('=========================================');
console.log('  Running Unit Tests for usb-2jcie-bu');
console.log('=========================================');

try {
    // 1. isEmpty
    process.stdout.write('Test: isEmpty ... ');
    assert.strictEqual(omron.isEmpty({}), true);
    assert.strictEqual(omron.isEmpty({ a: 1 }), false);
    console.log('PASS');

    // 2. concatTypedArrays
    process.stdout.write('Test: concatTypedArrays ... ');
    const u8a = new Uint8Array([1, 2]);
    const u8b = new Uint8Array([3, 4]);
    const concatenated = omron.concatTypedArrays([u8a, u8b]);
    assert.deepStrictEqual(concatenated, new Uint8Array([1, 2, 3, 4]));
    console.log('PASS');

    // 3. calcCrc16
    process.stdout.write('Test: calcCrc16 ... ');
    const arr = [new Uint8Array([0x52, 0x42])];
    const crc = omron.calcCrc16(arr);
    assert.strictEqual(typeof crc, 'number');
    console.log('PASS');

    // 4. createRequestData
    process.stdout.write('Test: createRequestData ... ');
    const reqData = omron.createRequestData();
    assert.strictEqual(reqData[0], 0x52);
    assert.strictEqual(reqData[1], 0x42);
    assert.strictEqual(reqData[4], 0x01);
    assert.strictEqual(reqData[5], 0x22);
    assert.strictEqual(reqData[6], 0x50);
    console.log('PASS');

    // 5. parseResponse
    process.stdout.write('Test: parseResponse ... ');
    const buffer = new Uint8Array(30);
    buffer[0] = 0x52; buffer[1] = 0x42; // Header
    buffer[2] = 26; buffer[3] = 0;      // Length (26)
    buffer[4] = 0;                      // Command
    buffer[5] = 0x22; buffer[6] = 0x50; // Address 0x5022
    buffer[7] = 1;                      // Sequence
    buffer[8] = 100; buffer[9] = 0;     // Temperature 1.00 degC

    // Calculate CRC for the constructed buffer (excluding last 2 bytes)
    const crcVal = omron.calcCrc16([buffer.subarray(0, 28)]);
    buffer[28] = crcVal & 0xFF;
    buffer[29] = (crcVal >> 8) & 0xFF;


    const parsed = omron.parseResponse(buffer);
    assert.ok(parsed, 'Parsed object should not be null/undefined');
    assert.strictEqual(parsed.sequence_number, 1);
    assert.strictEqual(parsed.temperature, 1.00);
    console.log('PASS');

    console.log('-----------------------------------------');
    console.log('All Unit Tests Passed.');
    console.log('-----------------------------------------');

} catch (e) {
    console.error('\nUNIT TEST FAILED');
    console.error(e);
    process.exit(1);
}
