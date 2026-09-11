# 会場ネットワーク runbook（ハッカソン当日の接続手順）

> 詳細・図解・出典つきの正本は [`docs/reports/network-connectivity.html`](../reports/network-connectivity.html)。
> 本書はその §0（結論）・§2（決定木）・§9（当日タイムライン）を、当日ブラウザを開かずに使えるよう Markdown 化したもの。
> 金額は 1 ドル = 150 円で換算。

---

## 1. 結論（30 秒）

会場で確実に動かす鍵は **「自分で AP（親機）を持つこと」** の 1 点。
共用 WiFi と iPhone テザリングは、どちらも **端末同士の通信を遮断する**ため Mac ↔ ESP32 の LAN 通信に使えない。

### 推奨ベスト 3

| 順位 | 構成 | なぜ | 準備 | 当日の切替 |
|---|---|---|---|---|
| **1 位** | **トラベルルーター**（GL.iNet 等） | 自分のサブネット `192.168.8.0/24` を持ち歩ける。SSID・パスワード・IP が会場によらず固定 = **焼き直し不要**。クライアント分離を自分で OFF にできる | GL-SFT1200 Opal 約 4,700〜5,100 円 / GL-MT3000 Beryl AX 9,500〜13,600 円を**今日発注**。前日に初期設定 10〜15 分 | **2〜3 分** |
| **2 位** | **Mac インターネット共有**（元 = iPhone USB / 先 = Wi-Fi） | macOS は Wi-Fi→Wi-Fi 共有はできないが、**iPhone を USB テザリングにすれば Wi-Fi 側を AP にできる**。Mac が `192.168.2.1` 固定の GW になる。追加ハード 0 円 | USB ケーブル、**前日に自宅で通し検証** | **5 分** |
| **3 位** | **MQTT クラウド中継**（HiveMQ 無料） | 外向き 443/8883 はほぼ確実に通る。Mac も ESP32 も**外へ出て行く**だけなので分離・IP 変動・AP 種別を一切気にしない。0 円 | HiveMQ Cloud Serverless 無料枠。ESP32 は PubSubClient + `setBufferSize(2048)` 必須。実装 1〜2h | **1 分（env 差替）** |

### やってはいけない 2 つ

| 禁止 | なぜ | 代わりに |
|---|---|---|
| **iPhone テザリング直下で Mac ↔ ESP32 を通信させる** | **iOS 18 以降、Apple が配下クライアント同士の IPv4 通信を遮断**（Apple DTS 明言）。全端末が `192.0.0.2`、ブロードキャスト／マルチキャストも不達。ESP32 は「IP 取得済み・ネットも使える」のに Mac から一切見えない、**最も紛らわしい失敗** | iPhone は **WAN 回線としてのみ**使う（ルーターの WAN、または Mac の USB テザリング元） |
| **会場共用 WiFi だけを頼りにする** | ゲスト SSID の既定はクライアント分離 ON。2.4/5GHz が別 VLAN だと同一 SSID でも不通。キャプティブポータルは ESP32 が踏めない。**事前検証できないのが致命的** | 共用 WiFi は「Mac のインターネット回線」または「ルーターの WAN 側」としてだけ使う |

> iOS 17 以前は `172.20.10.0/28` で端末間通信ができた。古い記事や過去の成功体験と食い違って見えるのはこのため。

---

## 2. 構成の決定木

上から順に答えると構成が 1 つに決まる。

- **Q1. トラベルルーターが手元にある？**
  - **YES → 構成 A：トラベルルーター**（推奨 1 位）
    - 自分のサブネットを持ち込めるので SSID・IP・分離設定がすべて自分の管理下。以降の分岐は考えなくてよい。WAN はスマホでも会場 WiFi でも可。
  - **NO → Q2 へ**
- **Q2. Android 端末（自分か仲間の）がある？**
  - **YES → Q2-1. その場で端末間 ping が通った？**
    - **YES → 構成 C：Android テザリング**
      - 準備 0 分で最速。ただし機種により分離が有効な個体があるので**必ず現物で ping 確認**してから採用。
    - **NO → Q3 へ**（分離されている個体なので粘らない）
  - **NO → Q3 へ**
- **Q3. iPhone を USB で Mac に挿せる？（ケーブルがある）**
  - **YES → 構成 B：Mac インターネット共有（元 = iPhone USB / 先 = Wi-Fi）**（推奨 2 位）
    - Mac が `192.168.2.1` の AP 兼 GW になる。会場 WiFi は使えなくなるが、インターネットは iPhone から取れる。
  - **NO → Q4 へ**
- **Q4. Mac のインターネットが切れても良い？**
  - **YES → 構成 F：ESP32 SoftAP に Mac が接続**
    - LAN 通信だけは確実。ただし Mac がインターネットから切り離される。SoftAP 同時接続は既定 4 台。
  - **NO → LAN を諦めて §7 のクラウド中継へ**（MQTT / BLE / 有線シリアル）
    - 会場 WiFi（構成 D）や iPhone テザリング（構成 E）に LAN 通信を期待してはいけない。

### どの葉でも共通でやること

1. ESP32／スタックちゃんは **WS クライアント**として Mac に繋ぎに行く（Mac が WS サーバー）
2. 機器の LCD に「IP / 接続先 URL / 接続状態」を常時表示する
3. `/dev` から接続先を実行時に上書きできるようにする（`.env.local` は再起動が要るのでデモ中に使えない）
4. USB シリアル入口を 1 本用意しておく

---

## 3. 当日タイムライン

### 3-1. 前日までのチェックリスト

- [ ] **今日**: トラベルルーターを発注（GL-SFT1200 Opal 約 4,700〜5,100 円 / GL-MT3000 Beryl AX 9,500〜13,600 円）。**当日に間に合う配送日を確認**
- [ ] **今日**: LAN 側の SSID / パスワードをチームで決定して共有（**パスワードはリポジトリに書かない**）
- [ ] **今日**: 機器チームに 4 点を確認
  - ESP32 のファーム種別（Arduino / ESP-IDF）
  - スタックちゃんのファーム（robo8080 / yh1224 / M5Stack 公式 / Moddable 公式）— **Moddable 公式だと HTTP/MQTT の口がなく設計が変わる**
  - Wi-Fi 設定の変更方法（WiFiManager / SD の `wifi.txt` / 再ビルド）
  - LCD に IP を表示する仕組みがあるか
- [ ] **2 日前**: 決定した SSID で ESP32／スタックちゃんに焼き込み（または SD の `wifi.txt` を書く）
- [ ] **2 日前**: 機器の LCD に IP・接続先 URL・接続状態を常時表示
- [ ] **2 日前**: HiveMQ Cloud 無料アカウント作成 + MQTT 疎通（保険）
- [ ] **前日**: **構成 B（iPhone USB → Mac の Wi-Fi 共有）を自宅で通し検証**
- [ ] **前日**: USB シリアル保険の実装と動作確認（給電ハブ・CP210x/CH340 ドライバ）
- [ ] **前日**: Electron を**本番ビルド**で起動して画面収録権限を通す（開発バイナリとは別アプリ扱い）
- [ ] **前日**: Tailscale を Mac とスマホに導入（ESP32 は非対応）
- [ ] **当日朝**: Supabase クラウドプロジェクトを起こす（1 週間無操作で一時停止するため）

#### 構成 B の手順（前日検証用）

1. iPhone を USB 接続し、インターネット共有を ON
2. システム設定 > 一般 > 共有 > インターネット共有 (i)
3. 共有元「iPhone USB」／共有先「Wi-Fi」
4. **Wi-Fi オプションで SSID 固定・WPA2/WPA3 混在・チャンネル 1/6/11（2.4GHz）** ← 5GHz 既定だと ESP32 から見えない
5. 共有を ON（**ON のままでは設定変更できない。変えるときは一度 OFF**）
6. Next は `-H 0.0.0.0` で起動。ESP32 の接続先は `http://192.168.2.1:3000`
7. Mac がスリープすると AP が止まるので `caffeinate -dimsu` を実行しておく

### 3-2. 到着直後 5 分の判定

```bash
# ① 同一 SSID（同帯域）か
ipconfig getsummary en0 | awk -F' SSID : ' '/ SSID : /{print $2}'
# Option を押しながら Wi-Fi アイコン → チャンネルが 1〜13 なら 2.4GHz

# ② 自分の IP とゲートウェイ（169.254.x.x なら DHCP 失敗）
ipconfig getifaddr en0
netstat -rn | grep default

# ③ 機器とゲートウェイへ ping（機器の IP は LCD から読む）
ping -c 3 192.168.8.50      # 機器
ping -c 3 192.168.8.1       # ゲートウェイ
#   → GW は通るのに機器が通らない ＝ クライアント分離

# ④ ARP で L2 到達性（incomplete なら L2 で遮断されている）
arp -a

# ⑤ mDNS が生きているか
dns-sd -B _services._dns-sd._udp
dns-sd -G v4 esp32-obake.local

# ⑥ 保険の疎通（LAN が死んでいてもこれが通れば MQTT に切り替えられる）
nc -zv <broker-host> 8883
nc -zv <broker-host> 8884
```

**判定基準**: ③ で機器に ping が通れば LAN 構成（A/B/C）で進む。通らなければ**迷わず MQTT 中継へ切り替える**。
ここで「なぜ通らないのか」を探り始めると 1 時間が溶ける。分離は AP 単位なので、席を移動すると結果が変わる点だけ覚えておく。

### 3-3. トラブル時の切り分け 8 ステップ

| # | 見るもの | コマンド | 判定 |
|---|---|---|---|
| 0 | 同一 SSID・同一帯域 | `ipconfig getsummary en0 \| awk -F' SSID : ' '/ SSID : /{print $2}'` | 違えば繋ぎ直す。2.4/5GHz が別 VLAN の可能性 |
| 1 | IP / デフォルト GW | `ipconfig getifaddr en0` / `netstat -rn \| grep default` | `169.254.x.x` は DHCP 失敗。機器 LCD の IP とサブネット一致を確認 |
| 2 | ping | `ping -c 3 <機器 IP>` / `ping -c 3 <GW>` | **GW は通るが機器が通らない → クライアント分離** |
| 3 | ARP | `arp -a` | `incomplete` = L2 不通。同一 IP に複数 MAC = IP 重複 |
| 4 | ポート | `nc -zv <機器 IP> 80` / `nc -zv 127.0.0.1 8787` | 閉じていればサーバー未起動か bind アドレス違い |
| 5 | HTTP / WS | `curl -v --max-time 3 http://<ip>/status` | WS は 101 が返るか。名前で失敗し IP で成功 → 名前解決の問題 |
| 6 | listen / FW / 権限 | `sudo lsof -i :3000` / `socketfilterfw --getglobalstate` | **`127.0.0.1` bind だと外から届かない → `next dev -H 0.0.0.0`**。Electron は「ローカルネットワーク」権限を確認 |
| 7 | mDNS | `dns-sd -B _http._tcp` / `dns-sd -G v4 esp32-obake.local` / `scutil --dns` | マルチキャスト遮断なら IP 直指定へ |
| 8 | ログ | ESP32 シリアル 115200 / Next の `err.name`・`err.cause.code` | 下表で場所を特定 |

#### エラーコード → 見る場所

| エラー | 意味 | 戻るステップ |
|---|---|---|
| `ENOTFOUND` | 名前が引けない | 7（mDNS / DNS） |
| `ECONNREFUSED` | ポートが閉じている（`::1` の罠も含む） | 4・6 |
| `EHOSTUNREACH` / `ENETUNREACH` | 経路がない | 1・2 |
| `TimeoutError` | パケットが消えている | 2（分離）・6（FW / ローカルネットワーク権限） |

---

## 4. 現行実装との接続（env）

実機への切替は env だけで済む（`packages/devices/src/index.ts` の `createDevices()` が読む）。

```bash
# <REPO_ROOT>/.env.local
DEVICE_MODE=real
DESKTOP_BASE_URL=http://127.0.0.1:8787   # Electron は同一 Mac なので必ず 127.0.0.1（localhost と書くと ::1 で ECONNREFUSED）
RAIL_BASE_URL=http://192.168.8.50        # ESP32 レール（構成 A の LAN IP）
STACKCHAN_WS_URL=ws://192.168.8.51       # スタックちゃん
```

- デモ中に値を変えたいときは `.env.local` ではなく **`/dev` ダッシュボードから実行時上書き**する（`.env.local` の変更は `next dev` の再起動を伴う）
- **`/dev` は認証なし・ローカル専用**。構成 B で `next dev -H 0.0.0.0` を使うときは、会場の他の参加者からも `/dev` と `/api/devices/*` が叩けてしまう。デモ本番は `-H 0.0.0.0` を外すか `DEVICE_AUTH_TOKEN` を設定する。トンネルで外に出すのは厳禁
- 詳細は [`docs/runbooks/devices.md`](devices.md)・[`docs/runbooks/dev-dashboard.md`](dev-dashboard.md)

## 5. 実装の落とし穴（抜粋）

- `WiFi.setSleep(false)` は自動再接続しないバグがあるので `STA_DISCONNECTED` イベントで `WiFi.reconnect()` を自前で呼ぶ
- ESPAsyncWebServer の WS は毎 loop `ws.cleanupClients()`（既定 8・実用 3〜4 の枠を食い潰す）
- PubSubClient は既定バッファ 256B → `setBufferSize(2048)` 必須（**最頻出の失敗**）
- TLS は 30〜45KB のヒープを食う。LAN 内は `ws://` 平文で良い
- 電源は 2A 以上・短く太い USB ケーブル（**ブラウンアウト再起動が不調の最多原因**）
- `MDNS.begin()` は Wi-Fi 接続**後**に呼ぶ
- Node の `fetch` は既定でタイムアウトしない → `AbortSignal.timeout(1500)` を必ず付ける
- WS サーバー・MQTT クライアント・serialport は `globalThis` シングルトンにする（HMR で増殖するため）

全 11 項目は [レポート §8](../reports/network-connectivity.html) を参照。
