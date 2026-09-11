import type { DevInput } from "./endpoints"

const STORAGE_KEY = "dev-dashboard:history:v1"
const MAX_ENTRIES = 50

export interface DevHistoryEntry {
  id: string
  endpointId: string
  method: string
  path: string
  input: DevInput
  status: number | null
  latencyMs: number
  ok: boolean
  at: number
}

/** サーバーレンダリング時のスナップショット（参照を固定する） */
const EMPTY: DevHistoryEntry[] = []

let cache: DevHistoryEntry[] | null = null
const listeners = new Set<() => void>()

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

function readStorage(): DevHistoryEntry[] {
  if (!isBrowser()) return EMPTY
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY
    return parsed.slice(0, MAX_ENTRIES) as DevHistoryEntry[]
  } catch {
    return EMPTY
  }
}

function writeStorage(entries: DevHistoryEntry[]): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // プライベートウィンドウなど localStorage が使えない環境では履歴を諦める
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getHistorySnapshot(): DevHistoryEntry[] {
  cache ??= readStorage()
  return cache
}

export function getHistoryServerSnapshot(): DevHistoryEntry[] {
  return EMPTY
}

export function pushHistory(entry: DevHistoryEntry): void {
  cache = [entry, ...getHistorySnapshot()].slice(0, MAX_ENTRIES)
  writeStorage(cache)
  emit()
}

export function clearHistory(): void {
  cache = EMPTY
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 失敗しても致命的ではない
    }
  }
  emit()
}

export function newHistoryId(): string {
  if (isBrowser() && typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
