# client/desktop（将来の Tauri v2 デスクトップ版）

会場での常設展示に向けて、`client/web` の Next.js アプリを **Tauri v2** でデスクトップアプリとして包む余地をここに確保している。**現時点では実装を持たない**（Web 版のみで開発を進める）。

## 前提となる制約

Tauri は基本的に**静的ファイルを WebView に読み込む**。`next.config.ts` に `output: 'export'` を付けて静的書き出しした場合、**Route Handler（`/api/chat`, `/api/robot/*`）は消える**。このアプリはサーバー側にしか置けないものが 2 つある。

- **LLM 呼び出し**（`ANTHROPIC_API_KEY` をクライアントに埋めるわけにいかない）
- **ロボットへの HTTP**（ブラウザ/WebView から LAN 直叩きは CORS と Local Network Access の制約を受ける。[runbooks/robot.md](../../docs/runbooks/robot.md) 参照）

したがって Tauri 化では、この 2 つの到達手段を置き換える必要がある。

## 案 A: Tauri command（Rust）に置き換える

`output: 'export'` でフロントを静的化し、サーバー処理を Rust 側の command として実装する。

```
UI ──invoke("send_robot_command")──▶ Rust command ──reqwest──▶ ロボット
UI ──invoke("chat")───────────────▶ Rust command ──▶ Anthropic API
```

- 長所: 配布物が 1 バイナリ。Node ランタイム不要で起動が速い。ネットワーク権限を Tauri の capability で厳密に絞れる
- 短所: **Mastra（TypeScript）の資産が使えない**。Agent・tools・Memory を Rust で書き直すか、Anthropic API を直接叩く薄い実装に退化する。会話履歴や tool 呼び出しの演出も作り直しになる

## 案 B: Next サーバーをサイドカーとして同梱する（推奨）

`next build`（standalone 出力）した Node サーバーを Tauri の **sidecar** としてバンドルし、アプリ起動時に localhost で立ち上げて WebView から読み込む。

```
Tauri 起動 ─spawn─▶ next start (127.0.0.1:随時ポート) ◀─WebView──
                      └─ /api/chat → Mastra → ロボット / Supabase
```

- 長所: **`client/web` のコードを一切変えずに済む**。Mastra・Route Handler・Memory がそのまま動く。Web 版とデスクトップ版で実装が分岐しない
- 短所: Node ランタイム同梱でバイナリが大きい。起動時にサーバーの ready 待ちが要る。ポート衝突時のフォールバックを実装する必要がある

**推奨は案 B。** このプロジェクトの価値は Mastra 側の会話ロジックにあり、それを Rust へ移植するコストが案 A の長所を上回る。展示用途では配布サイズや起動速度は問題になりにくい。

## 導入するときの手順（概略）

1. このディレクトリに `src-tauri/` を作る（`pnpm create tauri-app` か `tauri init`）
2. `beforeDevCommand` に `pnpm --filter web dev`、`devUrl` に `http://localhost:3000` を設定して開発時は Web 版をそのまま使う
3. 本番は `next build` の standalone 出力 + Node バイナリを `externalBin`（sidecar）として登録し、Rust の `setup` で spawn → ready を待って WebView をナビゲートする
4. env（`ANTHROPIC_API_KEY` 等）はビルドに焼き込まず、アプリのデータディレクトリに置いた設定ファイルから読む
5. Tauri の capability で、許可するネットワーク宛先を localhost とロボットの LAN アドレスに限定する
