# デスクトップ（Electron / Ghost Companion）runbook

`client/desktop` は Next.js + Electron のデスクトップアプリ（Ghost Companion）。
Electron のメインプロセス内にローカル HTTP サーバー（**Desktop API**）を持ち、
`client/web` の Route Handler（`@workspace/devices` の `DesktopClient`）から
スクリーンショット取得・ブラウザ起動を呼べる。

- 機器 API 全体の env・モック・安全要件は [`devices.md`](devices.md)
- API 仕様の正本は [`docs/specs/robot-api-requirements.md`](../specs/robot-api-requirements.md)

## 構成

| 項目 | 値 |
| --- | --- |
| ディレクトリ | `client/desktop` |
| Next.js | 15.5.24（`client/web` の 16 系とは別） |
| Electron | 44（**Node >= 22.12 必須**） |
| Electron main | `client/desktop/electron/main.js` |
| Desktop API | `client/desktop/electron/desktop-api.js` |
| Desktop API のポート | env `DESKTOP_API_PORT`、既定 **8792**（`127.0.0.1` に bind） |
| Next（デスクトップ側）のポート | 3000（`PORT` で変更可。Electron は 3000〜3002 を探す） |

> **`client/desktop` はルート workspace から除外されている。**
> `pnpm-workspace.yaml` に `- "!client/desktop"` を書き、`client/desktop/pnpm-workspace.yaml`
> を単独の workspace ルートにしている。Next のメジャーが異なり、`turbo run verify` に
> Electron のビルドを巻き込みたくないため。依存のインストールは
> **`cd client/desktop && pnpm install`** で別途行う。

## 起動

```bash
# 依存（初回のみ）
cd client/desktop && pnpm install

# ターミナル1 — Next（デスクトップ側の UI）
cd client/desktop && pnpm run dev

# ターミナル2 — Electron（Desktop API もここで起動する）
cd client/desktop && pnpm run electron
```

`pnpm run dev:desktop` で両方まとめて起動することもできる。
Electron 側は `GHOST_COMPANION_URL`（既定 `http://127.0.0.1:3000`）で Next を探す。
3000 が他の開発サーバーで埋まっているときは、

```bash
cd client/desktop && PORT=3001 pnpm run dev
cd client/desktop && GHOST_COMPANION_URL=http://127.0.0.1:3001 pnpm run electron
```

起動ログに次の行が出れば Desktop API は稼働している。

```
[desktop-api] listening on http://127.0.0.1:8792/api/v1/desktop (screen=granted)
```

**ポートが使用中なら +1 して自動リトライする**（最大 10 回）。実際のポートは上のログと
`GET /api/v1/desktop/status` の `port` に出るので、`DESKTOP_BASE_URL` はその値に合わせる。

停止は Electron ウィンドウを閉じるか `pnpm run electron:stop`。

## macOS の権限（TCC）— 先に読む

**この Electron アプリの権限は「どうやって起動したか」で別物になる。**（実測で確認済み）

| 起動方法 | TCC 上の要求元 | マイク | 画面収録 |
| --- | --- | --- | --- |
| `pnpm run electron`（ターミナルから） | **ターミナル側のアプリ**（Terminal / iTerm / エディタ等） | `not-determined` のまま。**許可ダイアログが出ない**（`askForMediaAccess` が ~70ms で false を返す） | ターミナルの許可を間借りする（ターミナルが許可済みなら `granted` に見える） |
| `pnpm run electron:open`（アプリバンドルから） | **Electron 自身**（bundle id `com.github.Electron`） | 初回に**許可ダイアログが出る** → システム設定の一覧に「Electron」が載る | Electron 自身の権限。**人間が System Settings で ON にする必要がある** |

macOS は子プロセスの権限要求を「責任のあるプロセス（responsible process）」＝ターミナルに帰属させる。
そのため**ターミナルから起動している限り、システム設定のマイク一覧に Electron は永久に現れない**。
これがユーザー報告の「マイクがオフと出るのに一覧に Electron が無い」の原因。

### マイク権限の付け方（初回に 1 回だけ）

```bash
# ターミナル1 — Next
cd client/desktop && pnpm run dev

# ターミナル2 — アプリバンドルとして起動（TCC 登録用）
cd client/desktop && pnpm run electron:open
```

起動直後に macOS のマイク許可ダイアログが出るので **「許可」を押す**。
以降はシステム設定 > プライバシーとセキュリティ > **マイク** に「Electron」が並び、
`pnpm run electron`（通常起動）でもマイクが使える。

`electron:open` は `open -n -a .../Electron.app --args <projectRoot>` を実行するだけ
（`client/desktop/electron/open-app.js`）。**`open` 経由なのでアプリのログはターミナルに流れない**ので、
ログを見たいときは通常の `pnpm run electron` を使う。

状態は `GET /api/v1/desktop/status` の `microphone_permission` / `screen_permission` で確認できる。

### 一覧に Electron が残っていて直らないとき（人間が実行）

開発ビルドの bundle id は **`com.github.Electron`**（＝この Mac 上のすべての Electron 開発アプリで共有）。
TCC の記録をリセットしてやり直す:

```bash
tccutil reset Microphone com.github.Electron
tccutil reset ScreenCapture com.github.Electron
```

実行後にアプリを再起動し、`pnpm run electron:open` でダイアログを出し直す。
**このコマンドは他の Electron 製アプリの許可にも影響するので、人間が判断して実行すること。**

### アプリ内の導線

「おはなし」でマイクが使えないとき、UI は「マイク設定を開く」ボタンと
`tccutil reset Microphone com.github.Electron` の案内を出す。
メインプロセス側（`electron/main.js` の `requestMicAccess()`）は、

- `not-determined` → ウィンドウを前面に出してから `askForMediaAccess('microphone')`
- ダイアログが出ず `not-determined` のまま false → 上のターミナル帰属の案内を `hint` で返す
- `denied` / `restricted` → マイク設定パネルを直接開き、`hint` を返す

renderer（`src/lib/mic.ts`）は **`denied` / `restricted` のときだけ即諦め**、
`not-determined` では `getUserMedia` まで進む（Chromium 側で要求できる場合があるため）。

## 画面収録（スクリーンショット）の権限 — macOS

`POST /api/v1/desktop/screenshot` は macOS の**画面収録**権限が必要。

1. システム設定 > プライバシーとセキュリティ > **画面収録**
2. リストの **Electron**（開発時）／ **Ghost Companion**（パッケージ版）を **ON**
3. **権限を変更したらアプリを再起動する**（再起動しないと変更が反映されない）

注意点:

- **開発ビルドとパッケージ版は別アプリとして扱われる。** 開発時に許可されるのは
  `client/desktop/node_modules/electron/dist/Electron.app`（bundle id `com.github.Electron`）で、
  `pnpm run dist` で作った `Ghost Companion.app`（`bas.100.ghost-companion`）は**改めて許可が要る**。
  会場で配布物を使うなら当日その場で許可すること
- **ターミナルから起動した場合はターミナルの画面収録許可を間借りしてしまう**（上の表）。
  配布物と同じ条件で確かめたいときは `pnpm run electron:open` で起動して `status` を見る
- 画面収録には Info.plist の usage description キーが**存在しない**（マイク・カメラと違い、
  `NSScreenCaptureUsageDescription` のようなキーは macOS には無く、OS が直接ダイアログを出す）。
  `package.json` の `build.mac.extendInfo` にはマイク・カメラ・音声取り込みの説明文だけ入れてある
- 権限が無い場合、API は **403** と `{"error":"screen_permission_denied","hint":"..."}` を返す
- 現在の状態は `GET /api/v1/desktop/status` の `screen_permission`
  （`granted` / `denied` / `not-determined` / `restricted` / `unknown`）で確認できる

## API と curl 例

すべて `127.0.0.1` のみで待ち受ける（外部ネットワークには晒さない）。CORS ヘッダは付けない
（Next の**サーバー側**からだけ呼ぶ前提）。

```bash
# 稼働状態（ポート・バージョン・稼働時間・画面収録権限）
curl -s http://127.0.0.1:8792/api/v1/desktop/status
# {"state":"running","port":8792,"version":"0.1.0","uptime_ms":5908,
#  "screen_permission":"granted","microphone_permission":"granted"}

# スクリーンショット（主ディスプレイを実解像度の PNG で。Data URL 接頭辞なしの base64）
curl -s -X POST http://127.0.0.1:8792/api/v1/desktop/screenshot | head -c 120
# {"mime_type":"image/png","image_base64":"iVBORw0KGgoAAAANSUhEUg..."}

# 既定ブラウザで URL を開く（http/https のみ。それ以外は 400）
curl -s -X POST -H 'content-type: application/json' \
  -d '{"url":"https://example.com"}' \
  http://127.0.0.1:8792/api/v1/desktop/browser/open
# {"ok":true,"url":"https://example.com"}
```

エラー時はすべて JSON。`content-type` が JSON でない POST は 400、未知のパスは 404、
例外は 500 を返す。全リクエストは `[desktop-api] POST /api/v1/desktop/screenshot` の形式で
1 行ログに出る。

## `client/web` から実機として叩く

`DEVICE_MODE=real` と `DESKTOP_BASE_URL` を渡して web を起動する。

```bash
# Electron を起動したまま、別ターミナルで
DEVICE_MODE=real DESKTOP_BASE_URL=http://127.0.0.1:8792 pnpm --filter web dev

curl -s http://localhost:3000/api/devices/desktop/status
# {"ok":true,"status":200,"data":{"state":"running","port":8792,...},"latencyMs":1}

curl -s -X POST http://localhost:3000/api/devices/desktop/screenshot | head -c 120
# {"ok":true,"status":200,"data":{"mimeType":"image/png","imageBase64":"iVBOR..."}}

curl -s -X POST -H 'content-type: application/json' \
  -d '{"url":"https://example.com"}' \
  http://localhost:3000/api/devices/desktop/browser/open
```

ワイヤ形式は snake_case（`mime_type` / `image_base64`）、`@workspace/devices` が camelCase
（`mimeType` / `imageBase64`）へ変換して返す。`/dev` ダッシュボードからも操作できる
（[`dev-dashboard.md`](dev-dashboard.md)）。

`DEVICE_MODE=mock` のときはモック機器（`pnpm devices:mock`）の 8792 に繋がる。
**Electron とモックは同じ 8792 を使うので同時起動しない**（Electron 側が +1 にずれる）。

## トラブルシュート

| 症状 | 対処 |
| --- | --- |
| `[desktop-api] port 8792 is busy → retry on 8793` | `pnpm devices:mock` か前回の Electron が残っている。`lsof -nP -iTCP:8792 -sTCP:LISTEN` で確認 |
| screenshot が 403 | 上の「画面収録の権限」。許可後に **Electron を再起動** |
| マイクがオフと出るが設定の一覧に Electron が無い | ターミナル起動では TCC に登録されない。`pnpm run electron:open` で起動し直してダイアログを出す |
| `askForMediaAccess` が即 false（ログに「mic prompt did not appear」） | 同上。ターミナルに権限要求が帰属している |
| screenshot が真っ黒／空 | 権限は付いているがアプリ再起動をしていない可能性。再起動する |
| Electron が Next を見つけない | `pnpm run dev` が 3000〜3002 で動いているか。`GHOST_COMPANION_URL` で明示する |
| `Node ... cannot run Electron 44` | Node >= 22.12 が必要（`nvm use 22`） |
| web から `ECONNREFUSED` | Electron が落ちている／ポートがずれている。`status` の `port` と `DESKTOP_BASE_URL` を突き合わせる |
