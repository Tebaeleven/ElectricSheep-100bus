# ElectricSheep-100bus

- **Next 16 の API は推測で書かない**。`client/web/AGENTS.md` と `node_modules/next/dist/docs` を参照すること。
- **Mastra は v1 API**。`createTool` の `execute` は `(input, context)` の 2 引数、モデルは `'google/gemini-3.8-flash'` のような文字列（モデルルーター）で指定する。LLM は Google Gemini（キーは `GOOGLE_GENERATIVE_AI_API_KEY`）。
- **`packages/*/src` の相対 import に `.js` を付けない**（`moduleResolution: Bundler`。付けると Turbopack のビルドが落ちる）。`packages/db` で `server-only` を import しない（`mastra dev` が起動できなくなる。代わりに実行時ガード）。
- **ファイル所有権と worktree 運用は `docs/development.md` を参照**すること（並列レーンは所有ファイル以外を編集しない）。

## 導線

- 開発手順の要約: `.claude/skills/dev-runbook/SKILL.md`（作業前に読む）
- 常時守る規約: `.claude/rules/monorepo.md`（契約不変・`@workspace/*` import・shadcn は `client/web`・ロボットはサーバー経由・env の正本）
- 全体像とコマンド: `README.md` / セットアップとトラブルシュート: `docs/setup.md`
- runbook: `docs/runbooks/{supabase,mastra,robot,devices,dev-dashboard}.md`（機器 API は `devices`、開発者ダッシュボード `/dev` は `dev-dashboard`）
- 納品ゲートは `pnpm verify`。push・PR・マージはしない。
