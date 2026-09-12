# Obake Media / Robot WebSocket

**既定（v0.5.3）**: 端末が WebSocket **サーバ**。PC / Next.js が Stack-chan に直接つなぐ。

```
ws://<端末IP>:8765/ws/v1/robot
ws://obake.local:8765/ws/v1/robot
```

PC の `server.py`（`:8030`）は **フォールバック**（ファームで `kMediaListenAsServer=0` にしたとき）。

## 端末サーバ（既定）

CUSTOM セッション＋ Xiaozhi UI ready のあと、Wi-Fi 接続と数秒待ちを経て `httpd` が立ち上がる（CUSTOM 直後に httpd を始めると内部 DRAM 不足で失敗しやすい）。

シリアルの目安:

```
obake_robot_ws: RobotWsStart -> SERVER :8765/ws/v1/robot (mdns obake.local)
obake_robot_ws: STA IP 172.16.0.xx  listen ws://172.16.0.xx:8765/ws/v1/robot
obake_robot_ws: httpd listening :8765/ws/v1/robot
```

確認:

```powershell
cd C:\Users\kazuh\Documents\Arduino\Obake_device\homelab\obake_media
python -m pip install aiohttp
python client_test.py obake.local
# または python client_test.py <端末のSTA IP>
```

プロトコル（`client_test.py` と同じ）:

| 方向 | 内容 |
|------|------|
| 接続直後 TEXT | `{"type":"hello","pcm_rate":N}` |
| 入力 TEXT | `hand.set`（open/close → 首 yaw。度数は `kHandOpenYawDeg` 等。グリッパではない）, `camera.capture`, `audio.start`, `audio.stop` |
| 応答 TEXT | `{"type":"ack","cmd":"..."}` / `{"type":"error",...}` |
| バイナリ | `0x02`+JPEG（capture 時のみ）、`0x01`+PCM16（`audio.start` 後。tee マイク） |

長さ 4 バイトのプレフィクスは **付けない**（`:8030` の PC サーバ経路とは別）。

設定: `firmware/main/stackchan/custom/obake/obake_config.h`

| 定数 | 既定 | 意味 |
|------|------|------|
| `kMediaListenAsServer` | `1` | `0` で旧クライアント経路 |
| `kRobotWsPort` / `kRobotWsPath` | `8765` `/ws/v1/robot` | 待ち受け |
| `kRobotWsMdnsHost` | `obake` | `obake.local` |
| `kMediaJpegQuality` | `20` | capture 時の JPEG |
| `kHandOpenYawDeg` / `kHandCloseYawDeg` / `kHandYawSpeed` | `45` / `0` / `150` | `hand.set` の yaw 2 パターン（手動調整） |

Next.js は **端末**の `ws://obake.local:8765/ws/v1/robot`（または STA IP）へ接続する。  
双方向トランシーバ・SDK ギャップ・段階計画はリポ根 [引き継ぎ.md](../../引き継ぎ.md) §2.1。

## フォールバック（PC サーバ）

`kMediaListenAsServer = 0` に戻してビルドした場合のみ。端末が PC へ外向き接続する。

```
http://127.0.0.1:8030/obake/latest.jpg
ws://<PC>:8030/obake/media
```

```powershell
cd C:\Users\kazuh\Documents\Arduino\Obake_device\homelab\obake_media
python server.py
```

| 目的 | URL |
|------|-----|
| **最新フレーム（PC 受信口）** | http://127.0.0.1:8030/obake/latest.jpg |
| 接続・枚数 JSON | http://127.0.0.1:8030/obake/status |

- `/` と旧 `/obake/view` は **`/obake/latest.jpg` へリダイレクト**
- この経路のバイナリは `[type][len:4 BE][payload]`、PCM 型は `0x20`

### 送り先（クライアント時）

| 定数 | 役割 | 例 |
|------|------|-----|
| `kMediaWsHost` | ログ用の論理名 | `"obake.media.stackchan"` |
| `kMediaWsLanIp` | **実際の TCP 先** | `"172.16.0.66"` |
| `kMediaWsPort` / `kMediaWsPath` | `8030` `/obake/media` | |

Windows `hosts` は PC ブラウザ専用。ESP は `kMediaWsLanIp` を使う。

```powershell
netsh advfirewall firewall add rule name="ObakeMedia8030" dir=in action=allow protocol=TCP localport=8030
```

マイク PCM は Xiaozhi AudioService の tee（二重 `InputData` だと無音になりやすい）。

## 名前解決

- **端末サーバ**: シリアルの STA IP、または mDNS `obake.local`（PC 側で mDNS が通ること）
- **クライアント経路**: ファームの `kMediaWsLanIp`。hosts はブラウザ用
