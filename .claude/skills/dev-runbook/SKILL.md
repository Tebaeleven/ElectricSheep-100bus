---
name: dev-runbook
description: ElectricSheep-100bus（おばけロボット会話アプリ）で開発するときの手順。環境構築・主要コマンド・ポート割当・ファイル所有権・worktree 運用・納品ゲート・禁止事項をまとめる。このリポジトリでコードを書く前、dev サーバーや Supabase を起動する前、worktree を作る/消す前に読む。
---

# ElectricSheep-100bus 開発 runbook

空中に浮かぶおばけロボットと会話する Web アプリ。Next.js 16（`client/web`）+ Mastra v1（`packages/agent`）+ ロボット HTTP 抽象（`packages/robot`）+ ローカル Supabase（`server/`, `packages/db`）の pnpm + Turborepo モノレポ。

## 最初に読むもの

| 目的 | ファイル |
|---|---|
| 全体像・クイックスタート | `README.md` |
| 環境構築とトラブルシュート | `docs/setup.md` |
| 並列開発・ファイル所有権・worktree | `docs/development.md` |
| DB スキーマ変更・RLS | `docs/runbooks/supabase.md` |
| Agent / tool / Memory | `docs/runbooks/mastra.md` |
| ロボット実仕様の差し替え | `docs/runbooks/robot.md` |
| 起動 / 停止（`pnpm run up` / `pnpm down`） | `docs/runbooks/launch.md` |
| 常時守る規約 | `.claude/rules/monorepo.md` |

## 起動

**`pnpm run up` 1 コマンドで必要なものが全部立ち上がる**（実体は `scripts/dev-up.mjs`。手順とプロファイル表は `docs/runbooks/launch.md`）。

```bash
pnpm install
pnpm --dir client/desktop install     # Electron を使うときだけ（ルート workspace 外）
cp client/web/.env.example client/web/.env.local   # 正本はこれ 1 つ。キーを入れる

pnpm run up          # mock: Supabase + bridge 8030 + 偽スタックちゃん + 機器モック 4 台（8791-8794）+ ロボットモック + web 3000 + Studio 4111
pnpm run up real     # Electron 実機: Supabase + desktop の Next 3100 + Electron 8801 + web 3000（DEVICE_MODE=real）
pnpm run up demo     # 本番デモ: real から Studio とモックを外し、http://localhost:3000 だけ開く
pnpm run up web      # web 3000 だけ
pnpm run up real --mock-device   # 実機が無い日に偽スタックちゃん + 機器モック 4 台も起動し、STACKCHAN_HTTP_URL 未設定なら 8794 を渡す
pnpm run up --dry-run   # 起動計画だけ表示（--no-open / --no-studio / --no-bridge / --mock-device / --help もある）

pnpm down            # 起動したプロセスを停止（このリポジトリのパス配下だけ）
pnpm down --all      # Supabase（Docker）も停止
```

- **`pnpm up` と書かない。** `up` は pnpm 組み込みの `update` に取られる。必ず `pnpm run up`（`pnpm start` も同じ）
- 起動前に使用ポートを確認し、**別プロセスが掴んでいたら起動せず exit 1**（同じ役割が動いていれば再利用）
- readiness は HTTP で確認する（web は `/api/dev/env`、Electron は `/api/v1/desktop/status` 等）。全て Ready でサマリー表を出す
- **Ctrl+C で自分が起動した子プロセスだけ停止**。Supabase と Electron は残るので `pnpm down --all`
- `real` / `demo` は **`.env.local` を書き換えず**、`DEVICE_MODE=real` / `DESKTOP_BASE_URL=http://127.0.0.1:8801` / `STACKCHAN_BRIDGE_URL=http://127.0.0.1:8030` を環境変数で渡すだけ
- **スタックちゃん bridge（8030）は全プロファイルで起動する**（`mock` は `/dev` 確認用に偽機器も。`--no-bridge` で両方外す）。偽機器はポートを持たないのでプロセス生存で Ready 判定し、`pnpm down` は `ps` から拾って止める
- 個別に起動したいとき（`pnpm db:start` / `pnpm robot:mock` / `pnpm devices:mock` / `pnpm stackchan:bridge` / `pnpm stackchan:mock-device` / `pnpm dev` / `pnpm agent:studio`）は README を参照。**A レーン以外は `pnpm db:start` を直接叩かない**（`pnpm run up` の再利用判定で既存の Supabase をそのまま使う）

## 納品ゲート

```bash
pnpm verify        # = turbo run lint typecheck test build
```

green にしてからコミット（日本語メッセージ）。**push / PR / マージはしない。**

## ポート

**起動前に `pnpm ports:check`**（台帳 `scripts/ports.json` と実際の LISTEN・`.env.local` を突き合わせ、衝突なら終了コード 1）。詳細は `docs/ports.md`。

3000 web（`/dev` は開発者ダッシュボード）/ **3100 `client/desktop` の Next**（`DESKTOP_NEXT_PORT`。3000 を取り合わない）/ 4111 Mastra Studio / 54321-54323 Supabase（API・DB・Studio）/ 8787 ロボットモック / **8030 スタックちゃん bridge**（`pnpm stackchan:bridge`。機器が繋ぎに来る WS 受け口 + HTTP。実機なしの確認は `pnpm stackchan:mock-device`）/ 8791-8794 機器モック 4 台（`pnpm devices:mock`。8793 のスタックちゃん WS は旧契約、**8794 は本体 HTTP = 手・LED。実機は機器上の 8765 で、向き先は `STACKCHAN_HTTP_URL`**）/ **8801 Electron 実機の Desktop API**（`DESKTOP_API_PORT`。8802 以降は将来のローカルブリッジ用に予約）。
モック 8792 と実機 8801 は別帯なので同時起動してよい。モック 8794 と実機 8765 も別ホストなので衝突しない。Electron はポートが埋まっていても**自動でずらさず**警告して Desktop API だけ無効にする。
並列レーンでは web は `PORT=3001..`、モックは `ROBOT_MOCK_PORT` でずらす（割当表は `docs/development.md`）。

## ファイル所有権

自分のレーンの所有ファイルだけを編集する。

| レーン | 所有 |
|---|---|
| A `feat/supabase-local` | `server/**`, `packages/db/src/**` |
| B `feat/robot-client` | `packages/robot/src/{http,mock-server}.ts`, `index.ts` の分岐, テスト |
| C `feat/web-chat` | `client/web/**` |
| D `docs/dev-runbook` | `README.md`, `docs/**`, `.claude/**`, `CLAUDE.md`, `client/desktop/README.md` |
| E `feat/agent-mastra` | `packages/agent/src/**` |

契約（`robotCommandSchema` / `RobotClient` / `mastra` / `ghost` / `GHOST_AGENT_ID` / `createServiceClient` / `logRobotCommand` / env 名）の**シグネチャは変更禁止**。

## worktree

```bash
pnpm wt setup <task> [base=develop]                       # 作成（env コピー + .env symlink + install）
git worktree remove <自分が作ったパス>                       # 削除は 1 本ずつ
```

## 禁止事項

- 所有外ファイルの編集、契約シグネチャの変更
- `main` への直接コミット / マージ（ユーザーの明示許可が必要）
- push / PR 作成 / マージ（統合フェーズで別途行う）
- `git worktree list` を回した一括削除、`--force`、worktree の `rm -rf`
- 履歴破壊系（`reset --hard` / `push --force` / `branch -D` / `clean -f`）
- A レーン以外が `pnpm db:start` / `db:reset` / `migration new` を実行すること
- ブラウザから直接ロボットを叩くコードを書くこと（必ず Route Handler / tool 経由）
