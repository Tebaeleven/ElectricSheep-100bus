"use client"

const THREAD_KEY = "ghost.threadId"
const RESOURCE_KEY = "ghost.resourceId"

export interface GhostSession {
  /** 会話スレッド ID（Mastra Memory の threadId） */
  thread: string
  /** 来場者 ID（Mastra Memory の resourceId） */
  resource: string
}

/**
 * useSyncExternalStore 用のスナップショット。
 * 同じ内容でも参照が変わると無限ループになるため、モジュール内にキャッシュする。
 */
let snapshot: GhostSession | null = null
const listeners = new Set<() => void>()

function readOrCreate(key: string): string {
  try {
    const stored = window.localStorage.getItem(key)
    if (stored) return stored

    const created = crypto.randomUUID()
    window.localStorage.setItem(key, created)
    return created
  } catch {
    // プライベートモード等で localStorage が使えない場合は都度生成する（履歴は残らない）
    return crypto.randomUUID()
  }
}

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeGhostSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** クライアント側のスナップショット。初回アクセス時に localStorage から復元・生成する */
export function getGhostSessionSnapshot(): GhostSession | null {
  if (typeof window === "undefined") return null
  if (!snapshot) {
    snapshot = {
      thread: readOrCreate(THREAD_KEY),
      resource: readOrCreate(RESOURCE_KEY),
    }
  }
  return snapshot
}

/** SSR 中は ID を生成しない（生成するとハイドレーション不一致になる） */
export function getGhostSessionServerSnapshot(): GhostSession | null {
  return null
}

/** 会話をリセットする（スレッドだけ作り直し、来場者 ID は維持する） */
export function resetGhostThread(): void {
  const current = getGhostSessionSnapshot()
  const thread = crypto.randomUUID()
  try {
    window.localStorage.setItem(THREAD_KEY, thread)
  } catch {
    // 保存できなくても新しいスレッドとしては扱える
  }
  snapshot = { thread, resource: current?.resource ?? crypto.randomUUID() }
  emit()
}
