# Obake Media（端末=クライアント → PC サーバ）

端末は WebSocket **サーバにしない**。Wi-Fi STA で PC の homelab に外向き接続する。

## エンドポイント（正本・AI 向け共通）

映像の取り出しは **これだけ**（画面確認も AI も同じ）:

```
http://127.0.0.1:8030/obake/latest.jpg
```

| 目的 | URL |
|------|-----|
| **最新フレーム（正）** | http://127.0.0.1:8030/obake/latest.jpg |
| 接続・枚数 JSON | http://127.0.0.1:8030/obake/status |
| 端末が繋ぐ WebSocket（受信口） | `ws://<PC>:8030/obake/media` |

- `/` と旧 `/obake/view` は **`/obake/latest.jpg` へリダイレクト**（専用 view UI は廃止）
- `Cache-Control: no-store` 付き。ブラウザで見るときはハードリロードか `?t=` を付けてもよい
- LAN: `http://172.16.0.66:8030/obake/latest.jpg` または hosts 済みなら `http://obake.media.stackchan:8030/obake/latest.jpg`
- Next.js / AI は **端末 IP ではなく PC サーバ** を見る

設定ファイル（端末）: `firmware/main/stackchan/custom/obake/obake_config.h`  
設定ファイル（PC サーバ）: `homelab/obake_media/server.py` の `HOST` / `PORT`  
変更後は端末を再ビルド・フラッシュ（`scripts/fast_build.ps1 -Flash`）。サーバだけ変えた場合は `server.py` 再起動。

## 画質・送信頻度の変え方（端末側）

すべて `obake_config.h`:

| 変えたいこと | 定数 | 既定 | メモ |
|--------------|------|------|------|
| JPEG 画質 | `kMediaJpegQuality` | `20` | 大きいほど高画質・重い（だいたい 10–40） |
| 映像の送信間隔 | `kMediaJpegIntervalMs` | `400` | ミリ秒。例: `200`≈5fps、`1000`=1fps |
| PCM 送信間隔 | `kMediaPcmIntervalMs` | `200` | マイクは Xiaozhi と共有 |
| JPEG 停滞で再接続 | `kMediaJpegStallMs` | `8000` | この時間成功無しなら WS 張り直し |
| 切断後の再接続待ち | `kMediaReconnectMs` | `5000` | サーバ未起動時のリトライ間隔 |

帯域や端末負荷がきつい → Quality を下げる / Interval を大きく。  
AI 用に枚数を増やしたい → Interval を小さく（CPU・Wi‑Fi 負荷増）。

## サーバ送り先の変え方

### 1) 別 PC / IP に送る（いちばん多い）

`obake_config.h`:

| 定数 | 役割 | 例 |
|------|------|-----|
| `kMediaWsHost` | ログ用の論理名 | `"obake.media.stackchan"` |
| `kMediaWsLanIp` | **実際の TCP 先**（ESP 用） | `"172.16.0.66"` ← PC の Wi‑Fi IPv4 |
| `kMediaWsPort` | ポート | `8030` |
| `kMediaWsPath` | WS パス | `"/obake/media"` |

手順:

1. 送り先 PC で `python server.py`（待ち受け `0.0.0.0:8030`）
2. その PC の IPv4 を `kMediaWsLanIp` に書く
3. ポートを変えるなら **端末の `kMediaWsPort` と `server.py` の `PORT` を同じ値に**
4. ビルド＆フラッシュ
5. （任意）ブラウザ用に Windows hosts へ `IP  obake.media.stackchan`

`kMediaWsLanIp` を `""`（空）にするとホスト名を OS DNS で解決する（ルータ等に A レコードがあるとき）。

### 2) PC サーバの待ち受けだけ変える

`server.py`:

- `HOST = "0.0.0.0"` … LAN から受ける（通常このまま）
- `PORT = 8030` … 変えたら端末の `kMediaWsPort` も合わせる

ファイアウォールも新ポート用に許可が必要。

## 名前解決（どう動くか）

目標 URL: `ws://obake.media.stackchan:8030/obake/media`

### 重要

- **Windows の `hosts` は PC 上のアプリだけ**に効く（ブラウザ / Next.js）。
- **ESP32 端末は別 DNS** を使うので、hosts だけでは端末は名前解決できない。

### このリポで採用している方法（推奨・実機向け）

1. **ファーム内蔵 LAN マップ**  
   `kMediaWsHost` = ホスト名のままログに出し、実際の TCP は `kMediaWsLanIp`（PC の Wi-Fi IPv4）へ繋ぐ。  
   ルータ管理画面や PC の port 53 が不要で、Xiaozhi 用の通常 DNS も壊さない。

2. **PC ブラウザ用 hosts**（任意）  
   `setup_hosts.ps1` を管理者で実行、または手で:

   ```
   172.16.0.66  obake.media.stackchan
   ```

3. **任意: 極小 LAN DNS** `dns_responder.py`（UDP/53・管理者）  
   他デバイスから本当に DNS 問い合わせしたいとき用。  
   ESP は通常 1 のマップで足りるので必須ではない。

PC の IP が変わったら: `kMediaWsLanIp`・hosts・（使うなら）dns_responder を同じ IP に更新して再フラッシュ。

ファイアウォール（未設定なら）:

```powershell
netsh advfirewall firewall add rule name="ObakeMedia8030" dir=in action=allow protocol=TCP localport=8030
```

## PC サーバ起動

```powershell
cd C:\Users\kazuh\Documents\Arduino\Obake_device\homelab\obake_media
python -m pip install aiohttp
python server.py
```

確認:

| 目的 | 見方 |
|------|------|
| 最新 JPEG | http://127.0.0.1:8030/obake/latest.jpg |
| JSON | http://127.0.0.1:8030/obake/status → `jpeg_count` 増加・`last_jpeg_age_sec` が小さい |
| マイク上行 | `status` の **`pcm_count` が増加**し、`last_pcm_age_sec` が小さいこと |
| 声の大きさ | `last_pcm_rms`（PCM 振幅の RMS＝**音量エンベロープ**。スピーカ再生ではない） |

重要:

- **音声の再生（聴く）パスは無い**。PC でマイク音が聞こえる UI/ファイル出力は未実装。
- 旧 `/obake/view` にあった RMS バーも廃止。今は `/obake/status` の数値だけ。
- `last_pcm_rms` が大きい＝その瞬間マイクが拾っている、という意味（通話再生ではない）。
- マイク PCM は Xiaozhi の AudioService 読み取りを tee して上行する（二重 `InputData` だと無音になりやすかった）。

サーバは約 15 秒メディア無しの WS をゾンビ切断する（古い `connected=true` のまま残さない）。

## 端末側

同じ Wi-Fi（例: meitetsu-inn）。`kObakeAutoCustom=1` なら起動後 CUSTOM 自動オープン。

シリアルに次が出れば OK:

```
obake_media_ws: RobotWsStart -> client obake.media.stackchan:8030/obake/media
obake_media_ws: media client task (host=obake.media.stackchan lan_ip=172.16.0.66)
obake_media_ws: connecting ws://obake.media.stackchan:8030/obake/media
obake_media_ws: resolve obake.media.stackchan -> 172.16.0.66 (firmware LAN map)
obake_media_ws: connected
```

## Next.js から見るとき

Next.js は **デバイスではなく PC サーバ**（`http://obake.media.stackchan:8030/obake/latest.jpg`）に繋ぐ。  
端末→PC の上行（JPEG/PCM）をサーバが受け、HTTP で配信する。

## 旧 API について

- 端末待ち受け `ws://<IP>:8765/ws/v1/robot` は廃止。`client_test.py` はその旧経路用。
- `/obake/view` 専用画面は廃止（`/obake/latest.jpg` へリダイレクト）。
