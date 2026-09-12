# モノレール XYZ REST API

**外部の中央サーバー**で動かすサービスです。HTTP APIとESP32向けWebSocketを同じアプリ・ポートに統合します。
このPCは開発・検証用です。公開先サーバー、モータドライバ、XYZと実機の対応は未設定です。
既存の28BYJ-48ファームウェアはこのXYZプロトコルに未対応で、実機への書き込みは行っていません。

```text
呼び出し元 ── HTTPS REST ── 外部中央サーバー ── WSS ── ESP32 ── ドライバ ── モノレール
```

秒数は駆動時間です。距離・座標の測定ではありません。例えば「Xを3秒増加方向へ」はX座標を3mm増やす意味ではありません。
X/Y/Zの増加方向、ドライバ端子、機械的な移動範囲は実機側で定義します。

## HTTPで呼ぶ

中央サーバーのベースURLを `https://rail.example.com` とした例です。URLは実際の公開先へ置き換えます。
`RAIL_API_TOKEN` の値を `Authorization: Bearer ...` に指定します。

### Xを増加方向へ3秒

```sh
curl -X POST https://rail.example.com/api/v1/move \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"axis":"X","direction":"increase","seconds":3}'
```

### Yを減少方向へ1.5秒

```json
{"axis":"Y","direction":"decrease","seconds":1.5}
```

同じ `POST /api/v1/move` へ送ります。Zも `"axis":"Z"` で指定できます。
`seconds` はJSON数値で0.001〜60秒。端数は1ミリ秒単位で切り上げます。

| API | 内容 |
| --- | --- |
| `POST /api/v1/move` | `axis`、`direction`、`seconds` で時間指定駆動 |
| `POST /api/v1/stop` | `{"axis":"X"}` でX停止、`{}` で全軸停止 |
| `GET /api/v1/status` | ESP32接続状態、対応軸、各軸の最新指令 |
| `GET /api/v1/commands/{command_id}` | 指令の実行確認・完了・失敗状態 |
| `GET /docs` | 操作可能なAPI仕様画面 |
| `GET /openapi.json` | OpenAPI仕様 |
| `GET /healthz` | サーバー稼働確認。ESP32接続状態とは別 |

移動と停止は `202 Accepted` を返します。例：

```json
{
  "command_id":"取得結果のUUID",
  "device_id":"rail-1",
  "type":"move",
  "axis":"X",
  "direction":"increase",
  "duration_ms":3000,
  "status":"sent"
}
```

実際の応答には送信時刻なども含みます。`sent` はWebSocketへ送信した状態で、実際に回転したことの確認ではありません。
ESP32の通知で `started` → `completed` に更新します。`completed` も装置のソフトウェアによる報告であり、位置センサの測定ではありません。
停止確認は `stopped`、置換された指令は `superseded`、装置のエラーは `failed`、通信切断や確認不足は `unknown` です。

同じ軸への新しい指令は前の動作を上書きします。他の軸は独立です。
切断中の指令は `503` で拒否し、再接続後に古い動作を再送しません。
ESP32が対応を申告していない軸は `409`、入力不正は `422`、認証失敗は `401` です。
HTTP応答が失われたときの自動再送は実装していません。同じPOSTの再送は新しい指令になるので、状態を確認して判断します。

## 外部サーバーへの配置

Python 3.11以上で、リポジトリのルートから実行します。

```sh
python -m venv .venv
.venv/bin/pip install -r server/requirements.txt
export RAIL_API_TOKEN="十分に長いランダムなAPI用トークン"
export RAIL_DEVICE_TOKEN="API用とは異なるランダムな装置用トークン"
export RAIL_DEVICE_ID="rail-1"
.venv/bin/python -m uvicorn server.app:app --host 0.0.0.0 --port 8000 --workers 1 --ws-max-size 4096
```

トークンはそれぞれ24文字以上、別々の値が必要です。例えば `python -c "import secrets; print(secrets.token_urlsafe(32))"` で生成します。
`.env.example` は設定項目の見本です。アプリが自動で読み込むファイルではありません。

Dockerの場合はリポジトリのルートをビルドコンテキストにします。

```sh
docker build -f server/Dockerfile -t monorail-api .
docker run --rm -p 8000:8000 --env-file server/.env monorail-api
```

公開側はHTTPS/WSS対応のリバースプロキシを置き、`/ws/device` のWebSocketアップグレードを通します。
ESP32はインターネットへ出られるWi-Fiから中央サーバーへ接続します。ESP32のアクセスポイントへの直接接続だけではこの外部接続は成立しません。
HTTPSとWSSは同じホスト・ポートで提供できます。

装置接続と指令履歴はプロセスメモリ内のため、**ワーカーは1つ**で動かします。複数レプリカには対応していません。
履歴は最大1000件で、終了済みの古い指令から削除します。再起動後の履歴永続化は未実装です。

## ESP32側の通信仕様

接続先：`wss://rail.example.com/ws/device`

ヘッダ：`Authorization: Bearer <RAIL_DEVICE_TOKEN>`

ESP32は接続後5秒以内に、実際に設定済みの軸だけを申告します。

```json
{"type":"hello","device_id":"rail-1","axes":["X","Y","Z"],"simulated":false}
```

サーバーは `welcome` で現在時刻（Unixミリ秒）、heartbeat間隔1000ms、watchdog 2000msを返します。
ESP32は毎秒 `{"type":"heartbeat"}` を送り、サーバーは同形式と現在時刻で応答します。

移動指令：

```json
{
  "type":"move",
  "command_id":"UUID",
  "axis":"X",
  "direction":1,
  "duration_ms":3000,
  "replace":true,
  "issued_at_ms":1700000000000,
  "expires_at_ms":1700000002000
}
```

`direction` は増加が `1`、減少が `-1`。停止は `type: "stop"` と `axis`（全軸ならnull）です。

ESP32ファームウェアで実装する動作契約：

1. 時計をNTP等で同期し、有効期限を過ぎた移動指令は実行せず `failed` を返します。
2. 指令IDの重複を再実行しません。同じ軸の前のタイマーを解除して新しい指令へ置き換えます。
3. 方向に対応するドライバ出力を設定してから `started` を返します。極性反転時の待ち時間等は使用ドライバの仕様に合わせます。
4. `duration_ms` は受信後に実行を開始した時点から単調時計で計測し、ESP32自身が出力を停止して `completed` を返します。
5. `stop` は既存のタイマーを解除して対象出力を停止し、`stopped` を返します。
6. WebSocket切断、またはheartbeat応答が2秒途絶えた場合は出力を停止します。再接続だけでは動作を再開しません。

状態通知：

```json
{"type":"event","command_id":"UUID","status":"started"}
```

同じ形式で `completed` / `stopped` / `failed` を送信します。`message` に短い説明を付けられます。
この契約は通信仕様で、DCモータ用GPIO出力・タイマーの実機実装は、ドライバ型番とXYZ割り当てが決まってから接続します。

## 検証

```powershell
.\.venv\Scripts\python.exe -m pip install -r server\requirements-test.txt
.\.venv\Scripts\python.exe -m unittest server.test_api -v
```

HTTP呼び出しと模擬ESP32のWebSocketを実際に接続して検証します。実物のモータを動かすテストではありません。
2026-09-11に11テスト成功（FastAPI 0.141.1 / Python 3.11）。外部サーバーへの公開とDCモータ実機との接続は未実施です。
実装には [FastAPIのWebSocket機能](https://fastapi.tiangolo.com/advanced/websockets/) と [lifespan](https://fastapi.tiangolo.com/advanced/events/) を使用しています。
