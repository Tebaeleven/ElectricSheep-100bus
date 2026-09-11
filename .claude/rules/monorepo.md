# モノレポ規約（常時遵守）

## 契約のシグネチャを変更しない

以下は複数パッケージ・複数レーンが前提にしている。実装は変えてよいが、**名前・型・引数は変えない**。変更が必要なら実行せず、必要な変更内容を報告する。

- `@workspace/robot`: `robotCommandSchema`, `RobotCommand`, `RobotResult`, `RobotClient`, `createMockRobotClient`, `createHttpRobotClient`, `createRobotClient`
- `@workspace/agent`: `mastra`, `ghost`, `GHOST_AGENT_ID`, `createStorage`
- `@workspace/db`: `Database`, `createServiceClient`, `logRobotCommand`
- env 名（正本は `client/web/.env.example` と `turbo.json` の `globalEnv`）

## パッケージ間の import は `@workspace/*`

相対パスでパッケージ境界を越えない。

```ts
// 正
import { robotCommandSchema } from "@workspace/robot"
import { mastra, GHOST_AGENT_ID } from "@workspace/agent"
import { Button } from "@workspace/ui/components/button"

// 誤
import { robotCommandSchema } from "../../../packages/robot/src/schema"
```

パッケージ内の相対 import は ESM なので `.js` 拡張子を付ける（`./agents/ghost.js`）。

新しいワークスペース依存を足したら `package.json` に `"@workspace/x": "workspace:*"` を追加する。外部ライブラリのバージョンは `pnpm-workspace.yaml` の `catalog:` を使い、個別に数字を書かない。

## shadcn の追加は `client/web` を指す

```bash
pnpm dlx shadcn@latest add button -c client/web
```

コンポーネントは `packages/ui/src/components` に生成される。`packages/ui` を直接指定しない。

## ロボットへの到達はサーバー側だけ

ブラウザ（Client Component）から `ROBOT_BASE_URL` へ fetch しない。必ず Next の Route Handler（`/api/robot/*`）か Mastra tool の `execute` から出す。理由は Chrome の Local Network Access 制約と CORS 回避（`docs/runbooks/robot.md`）。

Route Handler で Mastra を使うファイルには `export const runtime = "nodejs"` を書く。

## env の正本は `client/web/.env.local`

- 新しい env を足したら **`client/web/.env.example` と `turbo.json` の `globalEnv` の両方**を更新する
- `packages/agent/.env` は `client/web/.env.local` への symlink（`mastra dev` がパッケージ直下の `.env` を読むため）。実ファイルを作らない
- `.env*` はコミットしない（`!.env.example` のみ例外）
- 秘密鍵をクライアントバンドルに出さない。`NEXT_PUBLIC_` を付けてよいのは公開して問題ない値だけ

## Next 16 / Mastra v1 の API を推測で書かない

- Next 16: `client/web/AGENTS.md` と `node_modules/next/dist/docs/` を読む（`middleware` ではなく `proxy`、Route Handler の `params` は Promise）
- Mastra v1: `createTool` の `execute` は `(input, context)` の 2 引数、モデルは `'anthropic/...'` の文字列。`handleChatStream` は `version: 'v7'` を明示
