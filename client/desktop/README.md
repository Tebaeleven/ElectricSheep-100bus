# Ghost Companion

> **このリポジトリでの位置づけ**
>
> `client/desktop` は Next.js + Electron のデスクトップアプリ。Electron のメインプロセス内に
> ローカル HTTP サーバー（**Desktop API**: `electron/desktop-api.js`）を持ち、`client/web` から
> `@workspace/devices` 経由でスクリーンショット取得・ブラウザ起動を呼べる。
> 起動手順・画面収録権限・curl 例は **[`docs/runbooks/desktop.md`](../../docs/runbooks/desktop.md)**。
>
> - **ルート workspace からは除外**されている（`pnpm-workspace.yaml` の `!client/desktop`）。
>   依存は `cd client/desktop && pnpm install` で個別に入れる。npm ではなく **pnpm** を使う
> - Desktop API のポートは env `DESKTOP_API_PORT`（既定 8792、`127.0.0.1` bind、使用中なら +1）
> - Tauri v2 化を検討していた頃のメモは [`README.tauri-plan.md`](README.tauri-plan.md) に残してある

Petassist desk + TrueForge agent harness, with Obake（お化けちゃん）as an added companion.

## What’s included (Petassist full stack)

- Desk (`/desk`) with party dock, TalkPanel, grants / L0–L3
- Electron sticky pets (`/pet?id=…`)
- Agent APIs + **TrueForge** (`src/lib/agent/trueforge.ts`, MCP, sandbox)
- Companion / pocket flows from Petassist
- Obake webp sprites + wake word **おばけちゃん** + care talk (`/api/ghost/chat`)

## Node

Electron 44 needs **Node >= 22.12**:

```bash
nvm use 22
```

## Run

```bash
# terminal 1 — Next
nvm use 22 && npm run dev

# terminal 2 — TrueForge (optional but recommended for agent jobs)
npx @truefoundry/trueforge

# terminal 3 — Electron desk
nvm use 22 && npm run electron
```

Or `npm run dev:desktop` for Next + Electron.

## Env

```bash
cp .env.example .env.local
```

Set `TRUEFORGE_BASE_URL` (default `http://127.0.0.1:8790`) and model in TrueForge Settings.

## Assets

- Party coats: `public/party/{pet}/*.webp`
- Obake: `public/ghost/Obake*.webp`
