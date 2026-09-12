import type { IncomingMessage, ServerResponse } from "node:http"

import { PCM_BUFFER_MS_DEFAULT } from "./protocol"
import type { BridgeCore } from "./server"
import { toStatusJson } from "./server"

/** ブラウザ・中間キャッシュに古い画像を出させない（server.py と同じヘッダー） */
const NO_CACHE: Record<string, string> = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
}

/** `/obake/audio/recent` の既定取得長（ミリ秒） */
const AUDIO_RECENT_DEFAULT_MS = 2000

/** JSON を返す */
function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...NO_CACHE,
  })
  res.end(payload)
}

/** リクエスト本文を JSON として読む（壊れていたら空オブジェクト） */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** クエリの数値を読む */
function readNumberQuery(
  url: URL,
  key: string,
  fallback: number
): number {
  const raw = Number(url.searchParams.get(key) ?? "")
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

/**
 * bridge の HTTP API。パスはメンバー実装（server.py）と互換で、
 * `latest.json` / `audio/recent` / `events` / `head` を足している。
 */
export function createRequestHandler(
  core: BridgeCore
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    void handle(core, req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: message })
      else res.end()
    })
  }
}

async function handle(
  core: BridgeCore,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  const path = url.pathname
  const method = req.method ?? "GET"

  // 画面確認も AI も同じ latest.jpg を見る（server.py と同じリダイレクト）
  if (path === "/" || path === "/obake" || path === "/obake/view") {
    res.writeHead(302, { location: "/obake/latest.jpg", ...NO_CACHE })
    res.end()
    return
  }

  if (path === "/obake/status" && method === "GET") {
    sendJson(res, 200, toStatusJson(core))
    return
  }

  if (path === "/obake/latest.jpg" && method === "GET") {
    const jpeg = core.latestJpeg()
    if (!jpeg) {
      res.writeHead(404, { "content-type": "text/plain", ...NO_CACHE })
      res.end("no jpeg yet")
      return
    }
    res.writeHead(200, {
      "content-type": "image/jpeg",
      "content-length": String(jpeg.length),
      ...NO_CACHE,
    })
    res.end(jpeg)
    return
  }

  if (path === "/obake/latest.json" && method === "GET") {
    const jpeg = core.latestJpeg()
    if (!jpeg) {
      sendJson(res, 404, { ok: false, error: "no jpeg yet" })
      return
    }
    sendJson(res, 200, {
      mime_type: "image/jpeg",
      image_base64: jpeg.toString("base64"),
      received_at: core.state.lastFrameAt,
    })
    return
  }

  if (path === "/obake/audio/recent" && method === "GET") {
    const ms = Math.min(
      readNumberQuery(url, "ms", AUDIO_RECENT_DEFAULT_MS),
      PCM_BUFFER_MS_DEFAULT
    )
    const pcm = core.recentPcm(ms)
    sendJson(res, 200, {
      pcm_rate: core.state.pcmRate,
      mime_type: "audio/pcm",
      audio_base64: pcm.toString("base64"),
      bytes: pcm.length,
      requested_ms: ms,
      last_pcm_at: core.state.lastPcmAt,
    })
    return
  }

  // `/obake/servo` は server.py 互換のエイリアス
  if (
    (path === "/obake/head" || path === "/obake/servo") &&
    method === "POST"
  ) {
    const body = await readJsonBody(req)
    const sent = core.sendHead({
      yaw: Number(body.yaw ?? 0),
      pitch: Number(body.pitch ?? 0),
      speed: body.speed === undefined ? undefined : Number(body.speed),
    })
    if (!sent) {
      sendJson(res, 503, {
        ok: false,
        sent: false,
        error: "device not connected",
      })
      return
    }
    sendJson(res, 200, { ok: true, sent })
    return
  }

  if (path === "/obake/events" && method === "GET") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
      ...NO_CACHE,
    })
    // 接続直後に現在の状態を 1 回流す（UI が初期表示できるように）
    res.write(
      `event: status\ndata: ${JSON.stringify(toStatusJson(core))}\n\n`
    )
    const unsubscribe = core.subscribe((event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    })
    req.on("close", unsubscribe)
    return
  }

  sendJson(res, 404, { ok: false, error: `not found: ${method} ${path}` })
}
