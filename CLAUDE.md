# ElectricSheep-100bus

- **Next 16 の API は推測で書かない**。`client/web/AGENTS.md` と `node_modules/next/dist/docs` を参照すること。
- **Mastra は v1 API**。`createTool` の `execute` は `(input, context)` の 2 引数、モデルは `'anthropic/...'` のような文字列で指定する。
- **ファイル所有権と worktree 運用は `docs/development.md` を参照**すること（並列レーンは所有ファイル以外を編集しない）。

## 導線

- 開発手順の要約: `.claude/skills/dev-runbook/SKILL.md`（作業前に読む）
- 常時守る規約: `.claude/rules/monorepo.md`（契約不変・`@workspace/*` import・shadcn は `client/web`・ロボットはサーバー経由・env の正本）
- 全体像とコマンド: `README.md` / セットアップとトラブルシュート: `docs/setup.md`
- runbook: `docs/runbooks/{supabase,mastra,robot}.md`
- 納品ゲートは `pnpm verify`。push・PR・マージはしない。
