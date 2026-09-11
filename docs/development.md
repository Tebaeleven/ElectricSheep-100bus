# 並列開発ルール

複数のエージェント / セッションが同時にこのリポジトリを触る前提の運用ルール。**1 タスク = 1 ブランチ = 1 worktree**、所有ファイル以外は編集しない。

## ファイル所有権

各レーンは **所有列のファイルだけ** を編集する。他レーンのファイルに変更が必要になったら、自分で直さず「どのファイルにどんな変更が要るか」を報告する。

| レーン | ブランチ | 所有（これ以外は変更禁止） | 内容 |
|---|---|---|---|
| A | `feat/supabase-local` | `server/**`, `packages/db/src/**`（`index.ts` の公開シグネチャは不変） | Supabase ローカル初期化、`robot_commands` migration + RLS + index、seed、生成型、`logRobotCommand` 実装 |
| B | `feat/robot-client` | `packages/robot/src/http.ts`, `src/mock-server.ts`, `src/index.ts` の分岐、`src/*.test.ts` | `createHttpRobotClient`、モック HTTP サーバー、vitest |
| C | `feat/web-chat` | `client/web/**` | チャット UI、`POST /api/chat`、`/api/robot/*`、ロボット操作ボタン、thread/resource の localStorage 管理 |
| D | `docs/dev-runbook` | `README.md`, `docs/**`, `.claude/skills/**`, `.claude/rules/**`, `CLAUDE.md`, `client/desktop/README.md` | ドキュメント・runbook・スキル |
| E | `feat/agent-mastra` | `packages/agent/src/**`（`index.ts` の export 名は不変） | おばけの instructions、`robotCommand` / `robotStatus` tool、Memory 設定 |

共有ファイル（`package.json`, `turbo.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` など）は原則ブートストラップ時に確定済み。どうしても触る必要がある場合は**最小の 1 行**に留め、完了報告に明記する。

### 契約（シグネチャ変更禁止）

以下は他レーンが前提にしているため、**実装は変えてよいが型・名前は変えない**。

- `@workspace/robot`: `robotCommandSchema`, `RobotCommand`, `RobotResult`, `RobotClient`, `createMockRobotClient`, `createHttpRobotClient`, `createRobotClient`
- `@workspace/agent`: `mastra`, `ghost`, `GHOST_AGENT_ID`, `createStorage`
- `@workspace/db`: `Database`, `createServiceClient`, `logRobotCommand`
- env 名（`turbo.json` の `globalEnv` と `client/web/.env.example` が正本）

## worktree の作り方

```bash
pnpm wt setup <task> [base=develop]
```

`scripts/wt-setup.sh` がやること:

1. `.claude/worktrees/<task>` に worktree を作る（ブランチ名は `docs-*` なら `docs/<task>`、それ以外は `feat/<task>`）
2. `.worktreeinclude` に列挙された gitignore 対象ファイル（`client/web/.env.local`）をコピー
3. `packages/agent/.env` → `../../client/web/.env.local` の symlink を張る
4. `pnpm install --prefer-offline`

手動でやる場合の等価コマンド:

```bash
ROOT=/Users/nano/workspace/contest/hackathon/ElectricSheep-100bus
git -C "$ROOT" worktree add "$ROOT/.claude/worktrees/<task>" -b feat/<task> develop
cd "$ROOT/.claude/worktrees/<task>"
cp "$ROOT/client/web/.env.local" client/web/.env.local
mkdir -p packages/agent && ln -sfn ../../client/web/.env.local packages/agent/.env
pnpm install --prefer-offline
```

### 削除

```bash
git worktree remove /Users/nano/workspace/contest/hackathon/ElectricSheep-100bus/.claude/worktrees/<task>
```

- **自分のセッションが作った worktree だけ**を、**1 本ずつ**消す
- `git worktree list` をループして一括削除するのは禁止（他セッションが作業中のものを巻き込む）
- `--force` と `rm -rf` は禁止。未コミット変更が残っていたら消さずに報告する
- 削除してよいのは、実装が終わってコミット済み（push 済みなら尚可）になってから

## ポート割当

同時に dev サーバーを立てると奪い合うので、レーンごとに固定する。

| レーン | web | Mastra Studio | ロボットモック |
|---|---|---|---|
| C（web-chat） | 3000（既定） | 4111 | 8787（既定） |
| B（robot-client） | 使わない | – | `ROBOT_MOCK_PORT=8788` |
| E（agent-mastra） | `PORT=3001` | 4111（C が使っていない時のみ） | `ROBOT_MOCK_PORT=8789` |
| A（supabase-local） | `PORT=3002` | – | – |
| D（docs） | 立てない | – | – |

```bash
PORT=3001 pnpm dev
ROBOT_MOCK_PORT=8789 pnpm robot:mock
```

Supabase（54321-54323）は**インスタンスが 1 つしか立たない**。`pnpm db:start` / `db:stop` / `db:reset` / `migration new` を実行してよいのは **A レーンだけ**。他レーンは `DATABASE_URL` を空にして in-memory で開発する。

## 納品ゲート

worktree 内で以下が green になってからコミットする。

```bash
pnpm verify      # = turbo run lint typecheck test build
```

- コミットメッセージは日本語
- **push / PR 作成 / マージはしない**（統合は専任のエージェント、main への反映はユーザー許可後）
- 完了報告に「変更ファイル一覧・検証ログ・所有外に触った場合はその理由」を書く

## ブランチ運用

```
main        ← ユーザーの明示許可が出てからのみ反映
 └ develop  ← 統合先。各レーンのブランチはここから生やす
     ├ feat/supabase-local
     ├ feat/robot-client
     ├ feat/web-chat
     ├ feat/agent-mastra
     └ docs/dev-runbook
```

- 作業は必ずブランチ（worktree ブランチ）で行い、`main` に直接コミットしない
- `develop` への統合は統合フェーズでまとめて行う（A → B → E → C → D の順）
- `pnpm-lock.yaml` のコンフリクトは手で直さず、マーカー入りのまま `pnpm install` すれば pnpm が解決する
- 履歴破壊系（`reset --hard` / `push --force` / `branch -D` / `clean -f`）は明示指示があるまで実行しない
