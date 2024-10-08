//////////////////////////////////////////////////////////////////////
//	Copyright (C) Hiroshi SUGIMURA 2022.06.03
//////////////////////////////////////////////////////////////////////
'use strict';

const { SerialPort } = require('serialport');
const cron = require('node-cron');


let omron = {
	callback: null,
	portConfig: {
		path: 'COM3',
		baudRate: 115200,
		dataBits: 8,
		stopBits: 1,
		parity: 'none'
	},
	port: null,
	debug: false,

	//////////////////////////////////////////////////////////////////////
	// 空オブジェクト判定
	isEmpty: function(obj) {
		return Object.keys(obj).length === 0
	},


	//////////////////////////////////////////////////////////////////////
	// リクエストデータ生成 (Uint8Array)
	createRequestData: function () {
		// Header
		const header_view = new Uint8Array([0x52, 0x42]); // fix
		// Length (Payload ～ CRC-16)
		const length_view = new Uint16Array([5]);  // length = payload + CRC
		// Payload frame; command[1], address[2], data[n]
		const command_view = new Uint8Array([0x01]); // 0x01: Read, 0x02: Write
		const address_view = new Uint16Array([0x5022]); // 0x5022: Latest data short
		// CRC-16 (Header ～ Payload)
		const crc = omron.calcCrc16([header_view, length_view, command_view, address_view]);
		const crc_view = new Uint16Array([crc]);
		// 各 Typed Array を結合して 1 つの Uint8 Typed Array にする
		const req_data = omron.concatTypedArrays([header_view, length_view, command_view, address_view, crc_view]);

		return req_data;
	},

	//////////////////////////////////////////////////////////////////////
	// リクエストデータ生成 (Uint8Array)
	createSettingLED: function ( option ) {
		// Header
		const header_view = new Uint8Array([0x52, 0x42]); // fix
		// Length (Payload ～ CRC-16)
		const length_view = new Uint16Array([10]); // length = payload + CRC
		// Payload frame; command[1], address[2], data[n]
		const command_view = new Uint8Array([0x02]); // 0x01: Read, 0x02: Write
		const address_view = new Uint16Array([0x5111]); // 0x5111: LED

		// setting
		const display_rule = new Uint16Array([0x0001]);
		const led_red = new Uint8Array([option.red]);
		const led_blue = new Uint8Array([option.blue]);
		const led_green = new Uint8Array([option.green]);

		// CRC-16 (Header ～ Payload)
		const crc = omron.calcCrc16([header_view, length_view, command_view, address_view, display_rule, led_red, led_green, led_blue ]);
		const crc_view = new Uint16Array([crc]);
		// 各 Typed Array を結合して 1 つの Uint8 Typed Array にする
		const req_data = omron.concatTypedArrays([header_view, length_view, command_view, address_view, display_rule, led_red, led_green, led_blue, crc_view]);

		return req_data;
	},

	// Flash memory status
	requestFlashMemoryStatus: function () {
		// Header
		const header_view = new Uint8Array([0x52, 0x42]);  // fix
		// Length (Payload ～ CRC-16)
		const length_view = new Uint16Array([5]); // length = payload + CRC
		// Payload frame; command[1], address[2], data[n]
		const command_view = new Uint8Array([0x01]); // 0x01: Read, 0x02: Write
		const address_view = new Uint16Array([0x5403]); // 0x5403: flash memory status

		// CRC-16 (Header ～ Payload)
		const crc = omron.calcCrc16([header_view, length_view, command_view, address_view]);
		const crc_view = new Uint16Array([crc]);
		// 各 Typed Array を結合して 1 つの Uint8 Typed Array にする
		const req_data = omron.concatTypedArrays([header_view, length_view, command_view, address_view, crc_view]);

		return req_data;
	},


	//////////////////////////////////////////////////////////////////////
	// Typed Array オブジェクトのリストを 1 つの Uint8Array に連結
	concatTypedArrays: function (typed_array_list) {
		let byte_list = [];
		for (let typed_array of typed_array_list) {
			let uint8_view = new Uint8Array(typed_array.buffer, 0);
			for (let byte of uint8_view) {
				byte_list.push(byte);
			}
		}
		return new Uint8Array(byte_list);
	},

	//////////////////////////////////////////////////////////////////////
	// Typed Array のリストから CRC-16 を算出
	calcCrc16: function(typed_array_list) {
		let byte_list = omron.concatTypedArrays(typed_array_list);
		let reg = 0xffff;
		for (let i = 0; i < byte_list.length; i++) {
			reg = reg ^ byte_list[i];
			let bit_shift = 0;
			while (true) {
				let last_bit = reg & 1;
				reg = reg >>> 1;
				if (last_bit === 1) {
					reg = reg ^ 0xA001;
				}
				bit_shift++;
				if (bit_shift >= 8) {
					break;
				}
			}
		}
		return reg;
	},

	//////////////////////////////////////////////////////////////////////
	// レスポンスをパース
	parseResponse: function( recvData ) {
		if (recvData[0] !== 0x52 || recvData[1] !== 0x42) {  // 受信ヘッダ [0x42, 0x52] で固定 = [0x5242]
			return;
		}

		// 本当は recvData.buffer で行けると思うけど、過去データが呼び出されるという謎のバグに悩まされ、変換を2回をする中でバイト数調整をして何とかした
		// let data_view = new DataView( recvData.buffer );
		let data_view = new DataView( Uint8Array.from(recvData).subarray(0,30).buffer );

		// DataViewで必要なデータが得られなかった
		if( data_view.byteLength != 30 ) {
			omron.debug ? console.log('data_view: ', data_view) : 0;
			return;
		}

		let len = 0;
		try{
			len = data_view.getUint16(2, true);  // ここでOffset is outside the bounds of the DataViewが出るので調査中。とりあえず止まらないようにtry-catch
		}catch(e){
			console.error(e);
		}
		if (len !== recvData.byteLength - 4) {
			omron.debug ? console.log('レスポンスのバイト長異常を検知したため受信データを破棄しました: ' + len + ',' + recvData.byteLength) : 0;
			omron.debug ? console.log('recvData: ', recvData) : 0;
			return;
		}

		let command = data_view.getUint8(4);
		let address = data_view.getUint16(5, true);
		if (address == 0x5022) {
			// console.log('レスポンスのアドレスが未知のため受信データを破棄しました: address=' + address);
			let sequence_number  = data_view.getUint8(7);
			let temperature      = data_view.getInt16(8, true) / 100; // degC
			let humidity         = data_view.getInt16(10, true) / 100; // %RH
			let anbient_light    = data_view.getInt16(12, true); // lx
			let pressure         = data_view.getInt32(14, true) / 1000; // hPa
			let noise            = data_view.getInt16(18, true) / 100; // dB
			let etvoc            = data_view.getInt16(20, true); // ppb
			let eco2             = data_view.getInt16(22, true); // ppm
			let discomfort_index = data_view.getInt16(24, true) / 100;
			let heat_stroke      = data_view.getInt16(26, true) / 100; // degC


			// 出力をオブジェクトに
			return { 'sequence_number': sequence_number,
				'temperature': temperature, 'humidity': humidity, 'anbient_light': anbient_light, 'pressure': pressure, 'noise': noise,
				'etvoc': etvoc, 'eco2': eco2, 'discomfort_index': discomfort_index, 'heat_stroke': heat_stroke};

		}else if (address == 0x5111) {
			omron.debug ? console.log('LED setting [normal state].') : 0;
			let d  = data_view.getUint8(7);
			return { 'data': d };
		}else if (address == 0x5403) {
			omron.debug ? console.log('read Flash memory status.') : 0;
			let d  = data_view.getUint8(7);
			return { 'data': d };
		}

		omron.debug ? console.log('other address:', address) : 0;
		return;
	},


	//////////////////////////////////////////////////////////////////////
	// シリアルポートのリスト取得
	getPortList: async function () {
		let portList = [];

		await SerialPort.list()
			.then( (ports) => {
				portList = ports;
			}) .catch( (err) => {
				omron.debug ? console.log(err, "e") : 0;
			});

		return portList;
	},

	requestData: function () {
		if( !omron.port ) {  // まだポートがない
			if( omron.callback ) {
				omron.callback( null, 'Error: usb-2jcie-bu.requestData(): port is not found.' );
			}else{
				console.error( '@usb-2jcie-bu Error: usb-2jcie-bu.requestData(): port is not found.' );
			}
			return;
		}
		const b = omron.createRequestData();
		// console.log('req:', b);
		omron.port.write( b );
	},

	settingLED: async function( option ) {
		// console.log(option);
		if( !omron.port ) {  // まだポートがない
			if( omron.callback ) {
				omron.callback( null, 'Error: usb-2jcie-bu.settingLED(): port is not found.' );
			}else{
				console.error( '@usb-2jcie-bu Error: usb-2jcie-bu.settingLED(): port is not found.' );
			}
			return;
		}
		const b = omron.createSettingLED(option);
		// console.log('led:', b);
		await omron.port.write( b );
	},

	flashMemoryStatus: async function() {
		// console.log('flashMemoryStatus');
		await omron.port.write( omron.requestFlashMemoryStatus() );
	},

	//////////////////////////////////////////////////////////////////////
	// entry point
	start: async function ( callback, options = {} ) {
		omron.debug = options.debug == true ? true : false;

		if( omron.port ) {  // すでに通信している
			if( omron.callback ) {
				omron.callback( null, 'Error: usb-2jcie-bu.start(): port is used already.' );
			}else{
				console.error( '@usb-2jcie-bu Error: usb-2jcie-bu.start(): port is used already.' );
			}
			return;
		}

		omron.portConfig = {  // default config set
			path: 'COM3',
			baudRate: 115200,
			dataBits: 8,
			stopBits: 1,
			parity: 'none'
		};
		omron.port = null;

		if( callback ) {
			omron.callback = callback;
		}else{
			omron.debug ? console.log( 'Error: usb-2jcie-bu.start(): responceFunc is null.' ) : 0;
			return;
		}

		// 環境センサーに接続
		// ユーザーにシリアルポート選択画面を表示して選択を待ち受ける
		let portList = await omron.getPortList();
		let com = await portList.filter( (p) => {
			if( p.vendorId == '0590' && p.productId == '00D4') {
				return p;
			}
		});

		if( com.length == 0 ) {  // センサー見つからない
			if( omron.callback ) {
				omron.callback( null, 'Error: usb-2jcie-bu.start(): Sensor (2JCE-BU) is not found.' );
			}else{
				console.error( '@usb-2jcie-bu Error: usb-2jcie-bu.start(): Sensor (2JCE-BU) is not found.' );
			}
			return;
		}

		omron.portConfig.path = com[0].path;  // センサー見つかった

		omron.port = new SerialPort( omron.portConfig, function (err) {
			if (err) {
				if( omron.callback ) {
					omron.callback( null, err );
				}else{
					console.error( '@usb-2jcie-bu ' + err );
				}
				return;
			}
		});


		omron.port.on('data', function (recvData) {
			let r = omron.parseResponse( recvData );
			if( r ) {
				if( omron.callback ) {
					omron.callback( r, null);
				}else{
					omron.debug ? console.dir( r ) : 0;
				}
			}else{
				if( omron.callback ) {
					omron.callback( null, 'Error: recvData is nothing.' );
				}
			}
		});


		// USB外したりしたとき
		omron.port.on('close', function () {
			if( omron.port ) {
				omron.port.close();
				omron.port = null;
			}

			if( omron.callback ) {
				omron.callback( null, 'INF: port is closed.' );
				omron.callback = null;
			}
		});
	},

	stop: function () {
		if( omron.port ) {
			omron.port.close();
			omron.port = null;
		}

		if( omron.callback ) {
			omron.callback( null, 'INF: port is closed.' );
			omron.callback = null;
		}
	}
};


module.exports = omron;
//////////////////////////////////////////////////////////////////////
// EOF
//////////////////////////////////////////////////////////////////////
