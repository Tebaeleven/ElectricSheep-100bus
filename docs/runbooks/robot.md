# Runbook: ロボット接続

ロボットの実 HTTP 仕様は**後から共有される**前提で、`@workspace/robot` に抽象層を置いている。開発中はモックで動かし、仕様が届いたら差し替える。

```
packages/robot/src/
├─ schema.ts       # robotCommandSchema（コマンド語彙の唯一の正本）
├─ types.ts        # RobotCommand / RobotResult / RobotClient / HttpRobotClientOptions
├─ mock.ts         # createMockRobotClient（常に成功を返す）
├─ http.ts         # createHttpRobotClient（実機接続）
├─ mock-server.ts  # pnpm robot:mock で立つ HTTP サーバー（既定 8787）
└─ index.ts        # createRobotClient(env) で ROBOT_MODE 分岐
```

## コマンド語彙

`robotCommandSchema`（zod の discriminated union）を Web・Agent・モックで共用する。

| type | フィールド |
|---|---|
| `move` | `direction: up\|down\|left\|right\|forward\|back`, `durationMs?: number` |
| `stop` | — |
| `speak` | `text: string`（200 文字まで） |
| `emote` | `emotion: happy\|sad\|surprised\|neutral` |
| `raw` | `path: string`, `method: GET\|POST`（既定 POST）, `body?: unknown` |

`raw` は**実仕様が判明したがまだ語彙に取り込めていないエンドポイント**を叩くための逃げ道。ハッカソン当日に未知の API が出てきたら、まず `raw` で通してから語彙化する。

## なぜブラウザから直接叩かないのか

ロボットへの HTTP リクエストは**必ずサーバー側**（Next の Route Handler、または Mastra tool の `execute`）から出す。

- **Chrome の Local Network Access 制約**: 公開オリジン（および localhost）のページから LAN の私的アドレスへのリクエストは、ユーザー許可プロンプトや preflight を要求されるようになっている。展示中にプロンプトが出ると詰む
- **CORS**: ロボット側のファームウェアが `Access-Control-Allow-Origin` を返す保証がない。サーバー経由なら CORS は無関係
- **秘匿と一元化**: 接続先やトークンをブラウザに露出させず、`robot_commands` へのログも一箇所に集められる

UI からは `POST /api/robot/command` / `GET /api/robot/status` を叩く。

## 実仕様を受領したらやること

### 1. 実機の仕様をコマンド語彙にマッピングする

`packages/robot/src/http.ts` の `endpointMap` を書き換える。`createHttpRobotClient` は既定の `endpointMap` を持ち、オプションで差し替えられる。

```ts
const client = createHttpRobotClient({
  baseUrl: process.env.ROBOT_BASE_URL!,
  timeoutMs: 3000,
  endpointMap: {
    move:  { path: "/api/v1/drive",  method: "POST" },
    stop:  { path: "/api/v1/halt",   method: "POST" },
    speak: { path: "/api/v1/tts",    method: "POST" },
    emote: { path: "/api/v1/face",   method: "POST" },
    status:{ path: "/api/v1/state",  method: "GET"  },
  },
})
```

リクエストボディの形が違う場合（例: `{direction}` ではなく `{vx, vy}`）は、`http.ts` の中でコマンド → ボディ変換を足す。**`schema.ts` の語彙は変えない**（Web と Agent が依存しているため）。

### 2. env を切り替える

```bash
# client/web/.env.local
ROBOT_MODE=http
ROBOT_BASE_URL=http://192.168.x.x:PORT     # 実機の IP:ポート
```

`createRobotClient(env)` が `ROBOT_MODE` を見て mock / http を分岐する。

### 3. 未対応エンドポイントは `raw` で暫定対応

語彙にない操作は、`endpointMap` に足す前に `raw` で試す。

```bash
curl -X POST localhost:3000/api/robot/command \
  -H 'content-type: application/json' \
  -d '{"type":"raw","path":"/api/v1/led","method":"POST","body":{"color":"blue"}}'
```

動いたら `schema.ts` に正式なコマンドとして追加し、`endpointMap` と Mastra tool の説明文を更新する。

### 4. モックサーバーで疎通を確認する

実機の前に、まずモックで経路全体（UI → Route Handler → tool → HTTP）が通ることを確かめる。

```bash
pnpm robot:mock        # ROBOT_MOCK_PORT 既定 8787。全コマンドに 200 を返しログを出す

# 別ターミナル
ROBOT_MODE=http ROBOT_BASE_URL=http://127.0.0.1:8787 pnpm dev
curl -X POST localhost:3000/api/robot/command \
  -H 'content-type: application/json' -d '{"type":"emote","emotion":"happy"}'
```

モックサーバーの標準出力に受信したコマンドが出れば、`ROBOT_MODE=http` の経路は正しい。あとは `ROBOT_BASE_URL` を実機に向けるだけ。

## 失敗時の扱い

`RobotClient` は**例外を投げない**。タイムアウト（`AbortSignal.timeout(3000)`）やネットワークエラーも `{ ok: false, error, latencyMs }` の `RobotResult` として返す。ロボットが落ちていても会話は続く、という設計。UI・Agent 側も `ok: false` を前提に文言を出す。

## チェックリスト（実機投入時）

- [ ] `ROBOT_BASE_URL` が実機の IP:ポートを指している（PC と同じ LAN にいること）
- [ ] `ROBOT_MODE=http` になっている
- [ ] `endpointMap` が実仕様のパス・メソッドと一致している
- [ ] ボディ変換が実仕様のスキーマと一致している
- [ ] `GET /api/robot/status` が実機の状態を返す
- [ ] タイムアウト値（既定 3000ms）が実機の応答速度に対して妥当
- [ ] `robot_commands` にログが残っている（Supabase Studio 54323 で確認）
