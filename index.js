//////////////////////////////////////////////////////////////////////
//	Copyright (C) Hiroshi SUGIMURA 2022.06.03
//////////////////////////////////////////////////////////////////////
'use strict';

const { SerialPort } = require('serialport');


/**
 * OMRON USB環境センサ (2JCIE-BU) を制御するモジュール
 * @namespace omron
 */
let omron = {
	/**
	 * コールバック関数
	 * @type {function}
	 * @memberof omron
	 */
	callback: null,

	/**
	 * シリアルポートの設定
	 * @type {object}
	 * @property {string} path - ポートパス (例: 'COM3')
	 * @property {number} baudRate - ボーレート (デフォルト: 115200)
	 * @property {number} dataBits - データビット (デフォルト: 8)
	 * @property {number} stopBits - ストップビット (デフォルト: 1)
	 * @property {string} parity - パリティ (デフォルト: 'none')
	 * @memberof omron
	 */
	portConfig: {
		path: 'COM3',
		baudRate: 115200,
		dataBits: 8,
		stopBits: 1,
		parity: 'none'
	},

	/**
	 * シリアルポートオブジェクト
	 * @type {SerialPort}
	 * @memberof omron
	 */
	port: null,

	/**
	 * デバッグモードフラグ
	 * @type {boolean}
	 * @memberof omron
	 */
	debug: false,

	/**
	 * 受信データバッファ (内部用)
	 * @type {Uint8Array}
	 * @memberof omron
	 */
	internalBuffer: new Uint8Array(0),

	/**
	 * 空オブジェクト判定
	 * @param {object} obj - 判定するオブジェクト
	 * @returns {boolean} 空の場合はtrue
	 * @memberof omron
	 */
	isEmpty: function (obj) {
		return Object.keys(obj).length === 0
	},


	/**
	 * リクエストデータ生成 (Uint8Array)
	 * Read Latest data short (0x5022)
	 * @returns {Uint8Array} 生成されたリクエストデータ
	 * @memberof omron
	 */
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

	/**
	 * LED設定用データ生成 (Uint8Array)
	 * @param {object} option - LED設定オプション
	 * @param {number} option.red - 赤色の輝度 (0-255)
	 * @param {number} option.green - 緑色の輝度 (0-255)
	 * @param {number} option.blue - 青色の輝度 (0-255)
	 * @returns {Uint8Array} 生成された設定データ
	 * @memberof omron
	 */
	createSettingLED: function (option) {
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
		const crc = omron.calcCrc16([header_view, length_view, command_view, address_view, display_rule, led_red, led_green, led_blue]);
		const crc_view = new Uint16Array([crc]);
		// 各 Typed Array を結合して 1 つの Uint8 Typed Array にする
		const req_data = omron.concatTypedArrays([header_view, length_view, command_view, address_view, display_rule, led_red, led_green, led_blue, crc_view]);

		return req_data;
	},

	/**
	 * フラッシュメモリスステータスリクエスト生成
	 * @returns {Uint8Array} 生成されたリクエストデータ
	 * @memberof omron
	 */
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


	/**
	 * Typed Array オブジェクトのリストを 1 つの Uint8Array に連結
	 * @param {Array<TypedArray>} typed_array_list - 連結したいTyped Arrayのリスト
	 * @returns {Uint8Array} 連結されたUint8Array
	 * @memberof omron
	 */
	concatTypedArrays: function (typed_array_list) {
		let byte_list = [];
		for (let typed_array of typed_array_list) {
			let uint8_view = new Uint8Array(typed_array.buffer, typed_array.byteOffset, typed_array.byteLength);
			for (let byte of uint8_view) {
				byte_list.push(byte);
			}
		}
		return new Uint8Array(byte_list);
	},

	/**
	 * Typed Array のリストから CRC-16 を算出
	 * @param {Array<TypedArray>} typed_array_list - 計算対象のTyped Arrayリスト
	 * @returns {number} 計算されたCRC-16値
	 * @memberof omron
	 */
	calcCrc16: function (typed_array_list) {
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

	/**
	 * レスポンスデータをパースしてオブジェクトに変換
	 * (呼び出し元で完全なパケットフレームであることを保証すること)
	 * @param {Uint8Array} recvData - 受信データ (1パケット分)
	 * @returns {object|undefined} パースされたセンサーデータオブジェクト、またはundefined
	 * @memberof omron
	 */
	parseResponse: function (recvData) {
		if (recvData.length < 4) return; // 最低限ヘッダと長さフィールドが必要

		let data_view = new DataView(recvData.buffer, recvData.byteOffset, recvData.length);

		// Header check
		if (data_view.getUint8(0) != 0x52 || data_view.getUint8(1) != 0x42) {
			return;
		}

		// Length check (Packet Size = Length Value + 4 bytes header)
		// Note: The 'Length' field in the packet is (Payload + CRC).
		// Packet = Header(2) + Length(2) + Payload + CRC(2)
		// Thus, Length Value = Payload + CRC
		// Total Bytes = 4 + Length Value
		let len = data_view.getUint16(2, true);
		if (recvData.length !== len + 4) {
			omron.debug ? console.log('パケット長不一致: Expected ' + (len + 4) + ', Got ' + recvData.length) : 0;
			return;
		}

		// CRC Check
		// Payload starts at offset 4.
		// CRC is at the end (last 2 bytes).
		// However, calcCrc16 expects specific chunks.
		// Let's verify CRC by calculating it over Header(2)+Length(2)+Payload(N).
		// The last 2 bytes are the CRC to check against.
		// Data buffer for CRC calc: all bytes except last 2.
		let dataForCrc = recvData.subarray(0, recvData.length - 2);
		let expectedCrc = data_view.getUint16(recvData.length - 2, true);
		let actualCrc = omron.calcCrc16([dataForCrc]);

		if (actualCrc !== expectedCrc) {
			omron.debug ? console.log('CRC Error: Expected ' + expectedCrc.toString(16) + ', Got ' + actualCrc.toString(16)) : 0;
			// 厳しい実装ならここで弾くが、安定性向上のためログ出しのみにするか、弾くか。
			// 誤ったデータを渡すよりは弾いたほうがマシ
			return;
		}

		let command = data_view.getUint8(4);
		let address = data_view.getUint16(5, true);

		if (address == 0x5022) {
			let sequence_number = data_view.getUint8(7);
			let temperature = data_view.getInt16(8, true) / 100; // degC
			let humidity = data_view.getInt16(10, true) / 100; // %RH
			let anbient_light = data_view.getInt16(12, true); // lx
			let pressure = data_view.getInt32(14, true) / 1000; // hPa
			let noise = data_view.getInt16(18, true) / 100; // dB
			let etvoc = data_view.getInt16(20, true); // ppb
			let eco2 = data_view.getInt16(22, true); // ppm
			let discomfort_index = data_view.getInt16(24, true) / 100;
			let heat_stroke = data_view.getInt16(26, true) / 100; // degC

			return {
				'sequence_number': sequence_number,
				'temperature': temperature, 'humidity': humidity, 'anbient_light': anbient_light, 'pressure': pressure, 'noise': noise,
				'etvoc': etvoc, 'eco2': eco2, 'discomfort_index': discomfort_index, 'heat_stroke': heat_stroke
			};

		} else if (address == 0x5111) {
			omron.debug ? console.log('LED setting [normal state].') : 0;
			let d = data_view.getUint8(7);
			return { 'data': d };
		} else if (address == 0x5403) {
			omron.debug ? console.log('read Flash memory status.') : 0;
			let d = data_view.getUint8(7);
			return { 'data': d };
		}

		omron.debug ? console.log('other address:', address) : 0;
		return;
	},


	/**
	 * 利用可能なシリアルポートのリストを取得
	 * @async
	 * @returns {Promise<Array>} シリアルポート情報の配列
	 * @memberof omron
	 */
	getPortList: async function () {
		let portList = [];

		await SerialPort.list()
			.then((ports) => {
				portList = ports;
			}).catch((err) => {
				omron.debug ? console.log(err, "e") : 0;
			});

		return portList;
	},

	/**
	 * センサーデータのリクエストを送信
	 * @memberof omron
	 */
	requestData: function () {
		if (!omron.port) {  // まだポートがない
			if (omron.callback) {
				omron.callback(null, 'Error: usb-2jcie-bu.requestData(): port is not found.');
			} else {
				console.error('@usb-2jcie-bu Error: usb-2jcie-bu.requestData(): port is not found.');
			}
			return;
		}
		const b = omron.createRequestData();
		// console.log('req:', b);
		omron.port.write(b);
	},

	/**
	 * LEDの設定を行う
	 * @async
	 * @param {object} option - LED設定オプション
	 * @memberof omron
	 */
	settingLED: async function (option) {
		// console.log(option);
		if (!omron.port) {  // まだポートがない
			if (omron.callback) {
				omron.callback(null, 'Error: usb-2jcie-bu.settingLED(): port is not found.');
			} else {
				console.error('@usb-2jcie-bu Error: usb-2jcie-bu.settingLED(): port is not found.');
			}
			return;
		}
		const b = omron.createSettingLED(option);
		// console.log('led:', b);
		await omron.port.write(b);
	},

	/**
	 * フラッシュメモリの状態を確認する
	 * @async
	 * @memberof omron
	 */
	flashMemoryStatus: async function () {
		// console.log('flashMemoryStatus');
		await omron.port.write(omron.requestFlashMemoryStatus());
	},

	//////////////////////////////////////////////////////////////////////
	// entry point
	/**
	 * モジュールの開始処理
	 * シリアルポートを探索し、接続を確立してデータ受信の準備を行う
	 * @async
	 * @param {function} callback - データ受信時またはエラー発生時に呼ばれるコールバック関数 (err, data)
	 * @param {object} [options={}] - オプション設定
	 * @param {boolean} [options.debug=false] - デバッグモードの有効化
	 * @memberof omron
	 */
	start: async function (callback, options = {}) {
		omron.debug = options.debug == true ? true : false;

		if (omron.port) {  // すでに通信している
			if (omron.callback) {
				omron.callback(null, 'Error: usb-2jcie-bu.start(): port is used already.');
			} else {
				console.error('@usb-2jcie-bu Error: usb-2jcie-bu.start(): port is used already.');
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

		if (callback) {
			omron.callback = callback;
		} else {
			omron.debug ? console.log('Error: usb-2jcie-bu.start(): responceFunc is null.') : 0;
			return;
		}

		// 環境センサーに接続
		// ユーザーにシリアルポート選択画面を表示して選択を待ち受ける
		let portList = await omron.getPortList();
		let com = await portList.filter((p) => {
			if (p.vendorId == '0590' && p.productId == '00D4') {
				return p;
			}
		});

		if (com.length == 0) {  // センサー見つからない
			if (omron.callback) {
				omron.callback(null, 'Error: usb-2jcie-bu.start(): Sensor (2JCE-BU) is not found.');
			} else {
				console.error('@usb-2jcie-bu Error: usb-2jcie-bu.start(): Sensor (2JCE-BU) is not found.');
			}
			return;
		}

		omron.portConfig.path = com[0].path;  // センサー見つかった

		omron.port = new SerialPort(omron.portConfig, function (err) {
			if (err) {
				if (omron.callback) {
					omron.callback(null, err);
				} else {
					console.error('@usb-2jcie-bu ' + err);
				}
				return;
			}
		});


		// データ受信イベントのハンドリング強化
		// バッファリング処理を追加し、パケットの断片化や結合に対応
		omron.internalBuffer = new Uint8Array(0);

		omron.port.on('data', function (chunk) {
			// バッファに追加
			let newBuffer = new Uint8Array(omron.internalBuffer.length + chunk.length);
			newBuffer.set(omron.internalBuffer);
			newBuffer.set(chunk, omron.internalBuffer.length);
			omron.internalBuffer = newBuffer;

			while (omron.internalBuffer.length >= 4) { // ヘッダ(2) + 長さ(2) の最小4バイトが必要
				// ヘッダ検索 (0x52, 0x42)
				let headerIndex = -1;
				for (let i = 0; i < omron.internalBuffer.length - 1; i++) {
					if (omron.internalBuffer[i] === 0x52 && omron.internalBuffer[i + 1] === 0x42) {
						headerIndex = i;
						break;
					}
				}

				if (headerIndex === -1) {
					// ヘッダが見つからない場合、バッファをクリア（ただし最後の1バイトが0x52の可能性を考慮）
					if (omron.internalBuffer[omron.internalBuffer.length - 1] === 0x52) {
						omron.internalBuffer = omron.internalBuffer.slice(omron.internalBuffer.length - 1);
					} else {
						omron.internalBuffer = new Uint8Array(0);
					}
					break; // データ不足で待機
				}

				// ヘッダより前のゴミデータを破棄
				if (headerIndex > 0) {
					omron.internalBuffer = omron.internalBuffer.slice(headerIndex);
					continue; // 再度チェック
				}

				// 長さフィールドの読み取り
				let view = new DataView(omron.internalBuffer.buffer, omron.internalBuffer.byteOffset, omron.internalBuffer.length);
				let payloadLen = view.getUint16(2, true); // Payload + CRC
				let packetSize = 4 + payloadLen; // Header(2) + Length(2) + Payload + CRC

				if (omron.internalBuffer.length < packetSize) {
					// パケット全体がまだ揃っていない
					break;
				}

				// パケット抽出
				let packet = omron.internalBuffer.slice(0, packetSize);

				// バッファから抽出分を削除
				omron.internalBuffer = omron.internalBuffer.slice(packetSize);

				// パース実行
				let r = omron.parseResponse(packet);
				if (r) {
					if (omron.callback) {
						omron.callback(r, null);
					} else {
						omron.debug ? console.dir(r) : 0;
					}
				}
				// パースエラーでもバッファからは削除済みなのでループ継続
			}
		});


		// USB外したりしたとき
		omron.port.on('close', function () {
			if (omron.port) {
				omron.port.close();
				omron.port = null;
			}

			if (omron.callback) {
				omron.callback(null, 'INF: port is closed.');
				omron.callback = null;
			}
		});
	},

	/**
	 * モジュールの停止処理
	 * シリアルポートを閉じる
	 * @memberof omron
	 */
	stop: function () {
		if (omron.port) {
			omron.port.close();
			omron.port = null;
		}

		if (omron.callback) {
			omron.callback(null, 'INF: port is closed.');
			omron.callback = null;
		}
	}
};


module.exports = omron;
//////////////////////////////////////////////////////////////////////
// EOF
//////////////////////////////////////////////////////////////////////
