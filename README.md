# Overview

このモジュールは**OMRONのUSB環境センサ(2JCIE-BU)**をサポートします．
非公式ですので、本モジュールに関してOMRON社様に問い合わせなどは行わないようにお願いします．

This module provides **USB environment sensor (2JCIE-BU) producted by OMRON**.
This module is informality.


動作確認は 2JCIE-BU01 (https://www.fa.omron.co.jp/products/family/3724/lineup.html) で行いました．
OMRON 公式ページより、USB ドライバーをダウンロードして PC にインストールしてください。


NPMを見ると他にも開発されていますが、本モジュールの特徴は node-gyp に依存しないことです．
Windows以外では利点にならないかもしれません．



# Install


次に下記コマンドでモジュールをインストールできます．

You can install the module as following command.


```bash
npm i usb-2jcie-bu
```


# Demos

## Controller demo


Here is a demonstration script.

```JavaScript:Demo
'use strict';

const omron = require('usb-2jcie-bu');
const cron = require('node-cron');
require('date-utils');


omron.start(  (sensorData) => {
	console.log( '----------------------------' );
	let dt = new Date();
	console.log( dt );
	console.dir( sensorData );
});


// 2秒毎にチェック
cron.schedule('*/2 * * * * *', () => {
	omron.requestData();
});
```



# Data stracture

```JavaScript:stracture
sensorData: {
	'sequence_number': sequence_number,
	'temperature': temperature,
	'humidity': humidity,
	'anbient_light': anbient_light,
	'pressure': pressure,
	'noise': noise,
	'etvoc': etvoc,
	'eco2': eco2,
	'discomfort_index': discomfort_index,
	'heat_stroke': heat_stroke
}
```


# APIs

## 初期化と実行

- start(callback)
受信したらcallback関数を呼び出します。
callback関数は下記の形式です。

```
callback( sensorData )
```


## データのリクエスト

- requestData()


# 攻略情報

定期的にデータを取得するにはcronモジュールを活用するとよいです。

```
const omron = require('usb-2jcie-bu');
const cron = require('node-cron');

// 2秒毎にチェック
cron.schedule('*/2 * * * * *', () => {
	omron.requestData();
});
```

# meta data

## Authors

神奈川工科大学  創造工学部  ホームエレクトロニクス開発学科; Dept. of Home Electronics, Faculty of Creative Engineering, Kanagawa Institute of Technology

杉村　博; SUGIMURA, Hiroshi

## thanks

Thanks to Github users!

- 参考にしたソース、Reference
https://github.com/futomi/html5-omron-2jcie-bu


## License

MIT License

```
-- License summary --
o Commercial use
o Modification
o Distribution
o Private use
x Liability
x Warranty
```


## Log

- 0.0.2 ちょっとできたので公開
- 0.0.1 開発開始
