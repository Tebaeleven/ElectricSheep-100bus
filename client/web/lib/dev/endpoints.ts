import { z } from "zod"

// ポート台帳（scripts/ports.json）が正本。ここでは表示用に読み込むだけ
import portsLedger from "../../../../scripts/ports.json"

/** 機器グループ。左ペインの見出しに使う */
export type DevEndpointGroup =
  | "chat"
  | "robot"
  | "rail"
  | "desktop"
  | "stackchan"
  | "dev"

/** レスポンスの描画方法 */
export type DevResponseKind = "json" | "image" | "stream"

export type DevInput = Record<string, unknown>

export interface DevPreset {
  label: string
  input: DevInput
}

export interface DevEndpoint {
  id: string
  group: DevEndpointGroup
  method: "GET" | "POST"
  path: string
  description: string
  /** フォーム自動生成と入力検証に使う zod スキーマ。省略時は JSON タブのみ */
  inputSchema?: z.ZodType
  defaultInput: DevInput
  presets?: DevPreset[]
  responseKind: DevResponseKind
  /** 入力を実際のリクエストボディへ変換する（省略時は入力をそのまま送る） */
  toRequestBody?: (input: DevInput) => unknown
  /** GET でクエリ文字列に載せる場合 true */
  inputAsQuery?: boolean
}

/** 台帳 1 件分（表示に使う項目だけ） */
export interface ExpectedPort {
  name: string
  port: number
  label: string
  kind: string
  /** ポートを上書きできる env 名。無ければ null */
  env: string | null
}

/** ポート台帳（scripts/ports.json）をポート昇順にしたもの。/dev の env パネルで使う */
export const EXPECTED_PORTS: ExpectedPort[] = Object.entries(portsLedger.ports)
  .map(([name, entry]) => ({
    name,
    port: entry.port,
    label: entry.label,
    kind: entry.kind,
    env: "env" in entry ? (entry.env as string) : null,
  }))
  .sort((a, b) => a.port - b.port)

/** レール駆動時間の上限（ms）。要件定義の安全上限に合わせる */
export const RAIL_MAX_DURATION_MS = 3000

export const GROUP_LABELS: Record<DevEndpointGroup, string> = {
  chat: "チャット",
  robot: "ロボット（Mastra 経由）",
  rail: "レール（ESP32）",
  desktop: "デスクトップ（Electron）",
  stackchan: "スタックちゃん（WebSocket）",
  dev: "開発用",
}

export const GROUP_ORDER: DevEndpointGroup[] = [
  "chat",
  "robot",
  "rail",
  "desktop",
  "stackchan",
  "dev",
]

/** 空文字・undefined のキーを落とす（任意項目をそのまま送らないため） */
function compact(input: DevInput): DevInput {
  const result: DevInput = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue
    if (typeof value === "string" && value.trim() === "") continue
    result[key] = value
  }
  return result
}

const chatInputSchema = z.object({
  text: z.string().min(1).max(2000),
  thread: z.string().optional(),
  resource: z.string().optional(),
})

const robotCommandInputSchema = z.object({
  type: z.enum(["move", "stop", "speak", "emote", "raw"]),
  direction: z
    .enum(["up", "down", "left", "right", "forward", "back"])
    .optional(),
  durationMs: z.number().int().min(1).max(10000).optional(),
  text: z.string().max(200).optional(),
  emotion: z.enum(["happy", "sad", "surprised", "neutral"]).optional(),
  path: z.string().optional(),
  method: z.enum(["GET", "POST"]).optional(),
  body: z.unknown().optional(),
})

const railMoveInputSchema = z.object({
  axis: z.enum(["x", "y", "z"]),
  direction: z.union([z.literal(1), z.literal(-1)]),
  durationMs: z.number().int().min(1).max(RAIL_MAX_DURATION_MS),
})

const openUrlInputSchema = z.object({
  url: z.url(),
})

const handInputSchema = z.object({
  state: z.enum(["open", "closed"]),
})

const audioRecentInputSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
})

const emptyInputSchema = z.object({})

export const DEV_ENDPOINTS: DevEndpoint[] = [
  {
    id: "chat.send",
    group: "chat",
    method: "POST",
    path: "/api/chat",
    description:
      "おばけ Agent へのチャット。text だけ入れれば AI SDK v7 形式のボディに組み立てて送る",
    inputSchema: chatInputSchema,
    defaultInput: {
      text: "こんにちは！",
      thread: "dev-thread",
      resource: "dev-resource",
    },
    presets: [
      { label: "挨拶", input: { text: "こんにちは！" } },
      { label: "嬉しい？", input: { text: "いま嬉しい？" } },
      { label: "右に動いて", input: { text: "少し右に動いてみて" } },
      { label: "見せて", input: { text: "カメラで周りを見せて" } },
    ],
    responseKind: "stream",
    toRequestBody: (input) => ({
      messages: [
        {
          role: "user",
          parts: [{ type: "text", text: String(input.text ?? "") }],
        },
      ],
      memory: {
        thread: String(input.thread ?? "dev-thread"),
        resource: String(input.resource ?? "dev-resource"),
      },
    }),
  },
  {
    id: "robot.command",
    group: "robot",
    method: "POST",
    path: "/api/robot/command",
    description: "RobotClient へのコマンド送信（discriminated union）",
    inputSchema: robotCommandInputSchema,
    defaultInput: { type: "emote", emotion: "happy" },
    presets: [
      { label: "emote happy", input: { type: "emote", emotion: "happy" } },
      {
        label: "move right 500ms",
        input: { type: "move", direction: "right", durationMs: 500 },
      },
      { label: "speak", input: { type: "speak", text: "こんばんは" } },
      { label: "stop", input: { type: "stop" } },
    ],
    responseKind: "json",
    toRequestBody: (input) => compact(input),
  },
  {
    id: "robot.status",
    group: "robot",
    method: "GET",
    path: "/api/robot/status",
    description: "ロボットの状態取得",
    inputSchema: emptyInputSchema,
    defaultInput: {},
    responseKind: "json",
  },
  {
    id: "rail.move",
    group: "rail",
    method: "POST",
    path: "/api/devices/rail/move",
    description: `レール移動。durationMs は最大 ${RAIL_MAX_DURATION_MS}ms。失敗しても自動再送しない`,
    inputSchema: railMoveInputSchema,
    defaultInput: { axis: "x", direction: 1, durationMs: 500 },
    presets: [
      { label: "x+ 500ms", input: { axis: "x", direction: 1, durationMs: 500 } },
      {
        label: "y- 300ms",
        input: { axis: "y", direction: -1, durationMs: 300 },
      },
      {
        label: "z+ 1000ms",
        input: { axis: "z", direction: 1, durationMs: 1000 },
      },
    ],
    responseKind: "json",
  },
  {
    id: "rail.stop",
    group: "rail",
    method: "POST",
    path: "/api/devices/rail/stop",
    description: "レール緊急停止。リトライ可",
    inputSchema: emptyInputSchema,
    defaultInput: {},
    responseKind: "json",
  },
  {
    id: "rail.status",
    group: "rail",
    method: "GET",
    path: "/api/devices/rail/status",
    description: "レールの状態（moving / stopped / error）",
    inputSchema: emptyInputSchema,
    defaultInput: {},
    responseKind: "json",
  },
  {
    id: "desktop.screenshot",
    group: "desktop",
    method: "POST",
    path: "/api/devices/desktop/screenshot",
    description: "デスクトップのスクリーンショット（base64 画像）",
    inputSchema: emptyInputSchema,
    defaultInput: {},
    responseKind: "image",
  },
  {
    id: "desktop.browser.open",
    group: "desktop",
    method: "POST",
    path: "/api/devices/desktop/browser/open",
    description: "デスクトップでブラウザを開く。http/https のみ",
    inputSchema: openUrlInputSchema,
    defaultInput: { url: "https://example.com" },
    presets: [
      { label: "example.com", input: { url: "https://example.com" } },
      { label: "localhost:3000", input: { url: "http://localhost:3000" } },
      {
        label: "Supabase Studio",
        input: { url: "http://127.0.0.1:54323" },
      },
    ],
    responseKind: "json",
  },
  {
    id: "desktop.status",
    group: "desktop",
    method: "GET",
    path: "/api/devices/desktop/status",
    description: "デスクトップアプリの状態",
    inputSchema: emptyInputSchema,
    defaultInput: {},
    responseKind: "json",
  },
  {
    id: "stackchan.hand",
    group: "stackchan",
    method: "POST",
    path: "/api/devices/stackchan/hand",
    description: "手の開閉（ack を待つ）",
    inputSchema: handInputSchema,
    defaultInput: { state: "open" },
    presets: [
      { label: "open", input: { state: "open" } },
      { label: "closed", input: { state: "closed" } },
    ],
    responseKind: "json",
  },
  {
    id: "stackchan.camera",
    group: "stackchan",
    method: "POST",
    path: "/api/devices/stackchan/camera",
    description: "カメラ撮影（camera.frame を待って base64 画像を返す）",
    inputSchema: emptyInputSchema,
    defaultInput: {},
    responseKind: "image",
  },
  {
    id: "stackchan.audio.start",
    group: "stackchan",
    method: "POST",
    path: "/api/devices/stackchan/audio/start",
    description: "音声取得の開始",
    inputSchema: emptyInputSchema,
    defaultInput: {},
    responseKind: "json",
  },
  {
    id: "stackchan.audio.stop",
    group: "stackchan",
    method: "POST",
    path: "/api/devices/stackchan/audio/stop",
    description: "音声取得の停止",
    inputSchema: emptyInputSchema,
    defaultInput: {},
    responseKind: "json",
  },
  {
    id: "stackchan.audio.recent",
    group: "stackchan",
    method: "GET",
    path: "/api/devices/stackchan/audio/recent",
    description: "直近の音声チャンク（リングバッファ）を取得",
    inputSchema: audioRecentInputSchema,
    defaultInput: { limit: 10 },
    presets: [
      { label: "直近 5 件", input: { limit: 5 } },
      { label: "直近 50 件", input: { limit: 50 } },
    ],
    responseKind: "json",
    inputAsQuery: true,
  },
  {
    id: "stackchan.status",
    group: "stackchan",
    method: "GET",
    path: "/api/devices/stackchan/status",
    description: "WebSocket の接続状態",
    inputSchema: emptyInputSchema,
    defaultInput: {},
    responseKind: "json",
  },
  {
    id: "dev.env",
    group: "dev",
    method: "GET",
    path: "/api/dev/env",
    description: "秘密でない env と、キー類の設定有無（真偽値のみ）",
    inputSchema: emptyInputSchema,
    defaultInput: {},
    responseKind: "json",
  },
]

/** 上部固定バーの緊急停止で順に叩くエンドポイント */
export const EMERGENCY_STOP_STEPS: {
  label: string
  method: "POST"
  path: string
  body?: unknown
}[] = [
  { label: "rail/stop", method: "POST", path: "/api/devices/rail/stop" },
  {
    label: "stackchan/audio/stop",
    method: "POST",
    path: "/api/devices/stackchan/audio/stop",
  },
  {
    label: "robot stop",
    method: "POST",
    path: "/api/robot/command",
    body: { type: "stop" },
  },
]

/** ヘッダーで 5 秒ごとにポーリングする接続状態エンドポイント */
export const STATUS_POLL_TARGETS: { id: string; label: string; path: string }[] =
  [
    { id: "rail", label: "レール", path: "/api/devices/rail/status" },
    { id: "desktop", label: "デスクトップ", path: "/api/devices/desktop/status" },
    {
      id: "stackchan",
      label: "スタックちゃん",
      path: "/api/devices/stackchan/status",
    },
    { id: "robot", label: "ロボット", path: "/api/robot/status" },
  ]

export function findEndpoint(id: string): DevEndpoint | undefined {
  return DEV_ENDPOINTS.find((endpoint) => endpoint.id === id)
}
