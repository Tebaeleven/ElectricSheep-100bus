import type { DevEndpoint, DevInput, DevResponseKind } from "./endpoints"

/** レスポンス本文のプレビュー上限（文字） */
const TEXT_PREVIEW_LIMIT = 200_000

export interface DevImagePayload {
  mimeType: string
  base64: string
}

export interface DevRunResult {
  ok: boolean
  status: number | null
  statusText: string
  latencyMs: number
  kind: DevResponseKind
  /** 404 = ルート未実装（他レーン未マージ） */
  notImplemented: boolean
  json?: unknown
  text?: string
  image?: DevImagePayload
  error?: string
}

export function buildRequestBody(
  endpoint: DevEndpoint,
  input: DevInput
): unknown {
  return endpoint.toRequestBody ? endpoint.toRequestBody(input) : input
}

export function buildRequestUrl(
  endpoint: DevEndpoint,
  input: DevInput
): string {
  if (endpoint.method !== "GET" || !endpoint.inputAsQuery) return endpoint.path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${endpoint.path}?${query}` : endpoint.path
}

function pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return undefined
}

/** DeviceResult の入れ子（data）も含めて base64 画像を探す */
export function extractImage(payload: unknown): DevImagePayload | undefined {
  if (!payload || typeof payload !== "object") return undefined
  const record = payload as Record<string, unknown>
  const base64 = pickString(record, ["imageBase64", "image_base64"])
  if (base64) {
    return {
      base64,
      mimeType: pickString(record, ["mimeType", "mime_type"]) ?? "image/png",
    }
  }
  for (const key of ["data", "body", "result"]) {
    const nested = record[key]
    if (nested && typeof nested === "object") {
      const found = extractImage(nested)
      if (found) return found
    }
  }
  return undefined
}

/** ReadableStream を逐次読み取り、チャンクごとに onChunk を呼ぶ */
async function readStream(
  response: Response,
  onChunk: (accumulated: string) => void
): Promise<string> {
  const body = response.body
  if (!body) return await response.text()
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    accumulated += decoder.decode(value, { stream: true })
    if (accumulated.length > TEXT_PREVIEW_LIMIT) {
      accumulated = accumulated.slice(-TEXT_PREVIEW_LIMIT)
    }
    onChunk(accumulated)
  }
  accumulated += decoder.decode()
  onChunk(accumulated)
  return accumulated
}

export async function runEndpoint(
  endpoint: DevEndpoint,
  input: DevInput,
  options?: {
    signal?: AbortSignal
    onStreamChunk?: (accumulated: string) => void
  }
): Promise<DevRunResult> {
  const startedAt = performance.now()
  const url = buildRequestUrl(endpoint, input)

  try {
    const response = await fetch(url, {
      method: endpoint.method,
      signal: options?.signal,
      ...(endpoint.method === "GET"
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildRequestBody(endpoint, input)),
          }),
    })

    const base = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      kind: endpoint.responseKind,
      notImplemented: response.status === 404,
    }

    if (endpoint.responseKind === "stream" && response.ok) {
      const text = await readStream(response, options?.onStreamChunk ?? (() => {}))
      return { ...base, text, latencyMs: Math.round(performance.now() - startedAt) }
    }

    const raw = await response.text()
    const latencyMs = Math.round(performance.now() - startedAt)
    let json: unknown
    try {
      json = raw === "" ? undefined : JSON.parse(raw)
    } catch {
      json = undefined
    }

    return {
      ...base,
      latencyMs,
      json,
      text: json === undefined ? raw.slice(0, TEXT_PREVIEW_LIMIT) : undefined,
      image: endpoint.responseKind === "image" ? extractImage(json) : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      statusText: "",
      latencyMs: Math.round(performance.now() - startedAt),
      kind: endpoint.responseKind,
      notImplemented: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** ヘッダーの接続状態ポーリング用の軽量 GET */
export async function probeStatus(
  path: string,
  signal?: AbortSignal
): Promise<{ status: number | null; ok: boolean; data?: unknown }> {
  try {
    const response = await fetch(path, { signal, cache: "no-store" })
    let data: unknown
    try {
      data = await response.json()
    } catch {
      data = undefined
    }
    return { status: response.status, ok: response.ok, data }
  } catch {
    return { status: null, ok: false }
  }
}
