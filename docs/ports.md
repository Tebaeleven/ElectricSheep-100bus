# ポート割当

ローカル開発で使うポートの**正本は [`scripts/ports.json`](../scripts/ports.json)**。このページはその人間向けの読み下しで、確認スクリプト（`pnpm ports:check`）と `/dev` ダッシュボードの「期待ポート」表示も同じ台帳を読む。**ポートを増やす・変えるときは台帳を直してからこのページと README を更新する。**

## 起動前に 1 コマンド

```bash
pnpm ports:check
```

台帳の全ポートについて「誰が使う想定か」と「実際に何が LISTEN しているか」を並べて表示し、衝突があれば終了コード 1 で終わる。

## 台帳

| ポート | 名前 | 種別 | 役割 | 起動コマンド | env |
|---|---|---|---|---|---|
| 3000 | `web` | app | Next.js（`client/web`。`/dev` は開発者ダッシュボード） | `pnpm dev` | `PORT` |
| **3100** | `desktop_next` | app | **Next.js（`client/desktop` の Electron 表示用 UI）** | `pnpm --dir client/desktop run dev` | `DESKTOP_NEXT_PORT` |
| 4111 | `studio` | app | Mastra Studio | `pnpm agent:studio` | — |
| **8030** | `stackchan_bridge` | real | **スタックちゃん bridge**（機器が繋ぎに来る WS 受け口 + HTTP API。B 方式） | `pnpm stackchan:bridge` | `STACKCHAN_BRIDGE_PORT` |
| 8787 | `robot_mock` | mock | ロボットモック（HTTP） | `pnpm robot:mock` | `ROBOT_MOCK_PORT` |
| 8791 | `rail_mock` | mock | 機器モック: レール / ESP32（HTTP） | `pnpm devices:mock` | — |
| 8792 | `desktop_mock` | mock | 機器モック: デスクトップ（HTTP） | `pnpm devices:mock` | — |
| 8793 | `stackchan_mock` | mock | 機器モック: スタックちゃん（WebSocket） | `pnpm devices:mock` | — |
| **8801** | `desktop_real` | real | **Desktop API: Electron 実機**（Ghost Companion） | `pnpm --dir client/desktop run electron` | `DESKTOP_API_PORT` |
| 54321 | `supabase_api` | infra | Supabase ローカル API | `pnpm db:start` | `SUPABASE_URL` |
| 54322 | `supabase_db` | infra | Supabase Postgres | `pnpm db:start` | `DATABASE_URL` |
| 54323 | `supabase_studio` | infra | Supabase Studio | `pnpm db:start` | — |

台帳に載せていない番号: `3847`（パッケージ版 Electron が内蔵 Next を動かすポート。`client/desktop/electron/packaged-desk.js`）、`8790`（任意の TrueForge ハーネス。`client/desktop/.env.example`）。

**予約帯 8802-8809**: 将来のローカルブリッジ（ESP32 レール実機ブリッジ等）用に空けておく。モック帯 8791-8793 とは必ず分ける。スタックちゃんの bridge だけは例外で **8030**（メンバーの `firmware/stackchan/homelab/obake_media/server.py` と同じポートで、ファーム側に焼かれた接続先に合わせるため動かせない）。

### スタックちゃんは 8030（B 方式）

スタックちゃんは **機器側が WS クライアント**として PC の `ws://<PC の IP>:8030/obake/media` に繋ぎに来る（PC 側がサーバー）。`pnpm stackchan:bridge` がその受け口と HTTP API（`/obake/status`・`/obake/latest.jpg`・`/obake/audio/recent`・`POST /obake/head`）を同じ 8030 で提供する。Web からは `STACKCHAN_BRIDGE_URL=http://127.0.0.1:8030` を見て `@workspace/devices` の bridge クライアントが使われる。旧契約（Next が WS クライアントとして 8793 のモックに繋ぐ）はモック `stackchan_mock` として残してある。

### 3000 → 3100 に変えた理由（`client/desktop` の Next）

`client/desktop` の `pnpm run dev` は `next dev` をポート指定なしで起動していたため、
`client/web`（3000）が動いているとこっそり 3001 にずれていた。さらに
`electron/wait-for-desk.js` と `electron/main.js` は **3000 → 3001 → 3002 を順に探す**ので、
条件次第で **Electron が `client/web` の Web アプリを掴んで表示してしまう**。そこで

1. `client/desktop` の Next は **3100 固定**（`DESKTOP_NEXT_PORT` で変更可）
2. `wait-for-desk.js` / `main.js` は**そのポート 1 つだけ**を見る。見つからなければ
   「`pnpm --dir client/desktop run dev` を起動し、`pnpm ports:check` で確認」と出して失敗する

に変更した。**探して回らない**のが要点で、これで別アプリを掴む事故が起きない。

### 8792 → 8801 に変えた理由

以前は Electron 実機の Desktop API もモックと同じ **8792** を既定にしていて、`pnpm devices:mock` と Electron を同時に起動すると Electron が黙って 8793 → 8794… とずれていた。`DESKTOP_BASE_URL` は 8792 のままなので、**Web からは「繋がっているのにモックが応答する」という一番わかりにくい壊れ方**になる。そこで

1. 実機は **8801**（モック帯と分離）
2. Electron は **ポートを自動でずらさない**。使用中なら stderr に
   `[desktop-api] ポート 8801 が使用中です。pnpm ports:check で確認してください` を出し、**アプリは起動を続けて Desktop API だけ無効**にする（ウィンドウがあれば IPC `desktop-api:port-busy` でも通知）

に変更した。黙ってずれるより、明確に失敗させる。

## 同時起動の可否

| 組み合わせ | 可否 | 備考 |
|---|---|---|
| `pnpm dev`（3000）+ `pnpm devices:mock`（8791-8793） | ○ | 既定の開発構成 |
| `pnpm dev`（3000）+ `pnpm stackchan:bridge`（8030） | ○ | スタックちゃん実機（B 方式）の構成。`STACKCHAN_BRIDGE_URL=http://127.0.0.1:8030` と `DEVICE_MODE=real` にする |
| `pnpm stackchan:bridge`（8030）+ `pnpm devices:mock`（8791-8793） | ○ | ポート帯が別。`STACKCHAN_BRIDGE_URL` があればそちらが優先され、8793 のモックは使われない |
| `pnpm stackchan:bridge` を 2 つ | × | 2 つ目が EADDRINUSE で落ちる。`pnpm ports:free stackchan_bridge` で確認 |
| `pnpm devices:mock` + Electron 実機（8801） | **○（この変更で可）** | ポート帯が別。`DESKTOP_BASE_URL` をどちらに向けるかだけ決める |
| `pnpm dev`（3000）+ `client/desktop` の Next（3100） | **○（この変更で可）** | 以前は両方 3000 を取り合って desktop が 3001 にずれていた |
| web 3000 + desktop Next 3100 + Electron API 8801 + bridge 8030 + モック 8791-8793 | ○ | ハッカソン本番の全部入り構成。`pnpm ports:check` が全て OK になる |
| `client/desktop` の Next を 2 つ | × | 2 つ目は 3100 が埋まっていて起動できない |
| Electron 実機を 2 つ | × | 2 つ目は 8801 が埋まっているので Desktop API 無効で起動する |
| `pnpm devices:mock` を 2 つ | × | 2 つ目が EADDRINUSE で落ちる。`pnpm ports:free rail_mock` で確認 |
| `pnpm dev` を複数レーン | ○ | `PORT=3001` 等でずらす（`docs/development.md`） |
| `pnpm db:start`（54321-54323）+ 何でも | ○ | Docker 側。他と重ならない |

### `DESKTOP_BASE_URL` の決め方

| やりたいこと | `DEVICE_MODE` | `DESKTOP_BASE_URL` |
|---|---|---|
| プロセス内モックで完結（既定） | `mock` | 使われない（値はそのままでよい） |
| モックサーバーに HTTP で繋いで確認 | `real` | `http://127.0.0.1:8792` |
| **Electron 実機に繋ぐ** | `real` | `http://127.0.0.1:8801` |

`DEVICE_MODE=real` なのに `DESKTOP_BASE_URL` がモックの 8792 を指している、といった食い違いは `pnpm ports:check` が**衝突**として報告する（終了コード 1）。

## `pnpm ports:check` の使い方

```bash
pnpm ports:check            # 表で確認。衝突があれば終了コード 1
pnpm ports:check --json     # 機械可読（CI やフックから使う）
pnpm ports:check --help     # 台帳の一覧とヘルプ
pnpm ports:free 8792        # 8792 を掴んでいるプロセス名 + PID を表示（既定は表示のみ）
pnpm ports:free desktop_real --kill   # 表示したうえで SIGTERM を送る
```

判定の意味:

| 判定 | 意味 | 終了コードへの影響 |
|---|---|---|
| OK | 期待どおりのプロセスが LISTEN している | — |
| 未起動 | 誰も LISTEN していない（まだ起動していないだけ） | — |
| **衝突** | 期待と違うプロセスが掴んでいる／`DEVICE_MODE` と URL のポートが食い違う | **1** |
| 注意 | `DESKTOP_BASE_URL` の指す先で何も LISTEN していない 等 | — |

`lsof` が無い環境では `nc -z` にフォールバックする（疎通だけ分かり、プロセス名と PID は取れない）。

## 衝突したときの直し方

1. `pnpm ports:check` で、どのポートを何が掴んでいるか（プロセス名 + PID）を見る
2. 前回の開発サーバーが残っているだけなら `pnpm ports:free <name|port>` で PID を確認し、納得したら `--kill`
3. 他人のプロセス・別レーンのものだったら、**自分側をずらす**。web は `PORT=3001 pnpm dev`、ロボットモックは `ROBOT_MOCK_PORT=8788 pnpm robot:mock`、Electron は `DESKTOP_API_PORT=8802 pnpm --dir client/desktop run electron`、desktop の Next は `DESKTOP_NEXT_PORT=3101`（台帳にも書き足す）
4. `[desktop-api] ポート 8801 が使用中です` が出たまま Web から実機を叩きたい場合は、先に 8801 を空けて Electron を再起動する（Electron は自動でずれない＝**古いモックに繋がったまま気づかない、という事故が起きない**）
5. Docker（Supabase）の 54321-54323 が埋まっているときは `pnpm db:stop` → `pnpm db:start`

## 参照

- 台帳の正本: [`scripts/ports.json`](../scripts/ports.json)
- 確認スクリプト: [`scripts/check-ports.mjs`](../scripts/check-ports.mjs)
- 機器モック全般: [`docs/runbooks/devices.md`](runbooks/devices.md)
- Electron 実機: [`docs/runbooks/desktop.md`](runbooks/desktop.md)
- 並列レーンのポートずらし: [`docs/development.md`](development.md)
