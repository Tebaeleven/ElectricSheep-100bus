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
| 常時守る規約 | `.claude/rules/monorepo.md` |

## 起動

```bash
pnpm install
cp client/web/.env.example client/web/.env.local   # 正本はこれ 1 つ
pnpm db:start      # Supabase（Docker 必須）。不要なら DATABASE_URL を空にして in-memory
pnpm robot:mock    # ロボットモック 8787
pnpm devices:mock  # 機器モック 3 台（レール 8791 / デスクトップ 8792 / スタックちゃん 8793）
pnpm dev           # web 3000。全 API を手で叩ける開発者ダッシュボードは http://localhost:3000/dev
pnpm agent:studio  # Mastra Studio 4111（任意）
```

## 納品ゲート

```bash
pnpm verify        # = turbo run lint typecheck test build
```

green にしてからコミット（日本語メッセージ）。**push / PR / マージはしない。**

## ポート

3000 web（`/dev` は開発者ダッシュボード）/ 4111 Mastra Studio / 54321-54323 Supabase（API・DB・Studio）/ 8787 ロボットモック / 8791-8793 機器モック（`pnpm devices:mock`）。
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
