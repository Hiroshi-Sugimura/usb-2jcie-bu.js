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


	//////////////////////////////////////////////////////////////////////
	// リクエストデータ生成 (Uint8Array)
	createRequestData: function () {
		// Header
		const header_view = new Uint8Array([0x52, 0x42]);
		// Length (Payload ～ CRC-16)
		const length_view = new Uint16Array([5]);
		// Payload frame
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
		if (recvData[0] !== 0x52 || recvData[1] !== 0x42) {
			return;
		}

		// 本当は recvData.buffer で行けると思うけど、過去データが呼び出されるという謎のバグに悩まされ、変換を2回をする中でバイト数調整をして何とかした
		// let data_view = new DataView( recvData.buffer );
		let data_view = new DataView( Uint8Array.from(recvData).subarray(0,30).buffer );

		let len = 0;
		try{
			len = data_view.getUint16(2, true);  // ここでOffset is outside the bounds of the DataViewが出るので調査中。とりあえず止まらないようにtry-catch
		}catch(e){
			// console.error(e);
			// console.dir( JSON.stringify(data_view) );
		}
		if (len !== recvData.byteLength - 4) {
			// console.log('レスポンスのバイト長異常を検知したため受信データを破棄しました: ' + len + ',' + recvData.byteLength);
			return;
		}

		let command = data_view.getUint8(4);
		let address = data_view.getUint16(5, true);
		if (address !== 0x5022) {
			// console.log('レスポンスのアドレスが未知のため受信データを破棄しました: address=' + address);
			return;
		}

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
	},


	//////////////////////////////////////////////////////////////////////
	// シリアルポートのリスト取得
	getPortList: async function () {
		let portList = [];

		await SerialPort.list()
			.then( (ports) => {
				portList = ports;
			}) .catch( (err) => {
				console.log(err, "e")
			});

		return portList;
	},

	requestData: function () {
		if( !omron.port ) {  // まだポートがない
			omron.callback( null, 'Error: usb-2jcie-bu.requestData(): port is not found.' );
			return;
		}
		omron.port.write( omron.createRequestData() );
	},


	//////////////////////////////////////////////////////////////////////
	// entry point
	start: async function ( callback, options = {} ) {

		if( omron.port ) {  // すでに通信している
			omron.callback( null, 'Error: usb-2jcie-bu.start(): port is used already.' );
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
			console.log( 'Error: usb-2jcie-bu.start(): responceFunc is null.' );
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
			omron.callback( null, 'Error: usb-2jcie-bu.start(): Sensor (2JCE-BU) is not found.' );
			return;
		}

		omron.portConfig.path = com[0].path;  // センサー見つかった

		omron.port = new SerialPort( omron.portConfig, function (err) {
			if (err) {
				omron.callback( null, err );
				return;
			}
		});


		omron.port.on('data', function (recvData) {
			let r = omron.parseResponse( recvData );
			if( r ) {
				omron.callback( r, null);
			}else{
				omron.callback( null, 'Error: recvData is nothing.' );
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
