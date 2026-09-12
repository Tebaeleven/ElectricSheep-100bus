"use client";

import { DESK_ID, type ChatLine, type ChatRole } from "@/lib/talk";
import type { DeskArtifact } from "@/lib/agent/types";

const KEY_V1 = "pockassist.chat.v1";
const KEY = "pockassist.chat.v2";
const MAX_PER_PET = 80;
const MAX_THREADS = 40;
const MAX_TEXT = 4000;
const MAX_ARTIFACTS = 40;

export type ChatMap = Record<string, ChatLine[]>;

export type ChatRoomSnap = {
  id: string;
  title: string;
  updatedAt: number;
};

export type ChatThread = {
  id: string;
  petId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lines: ChatLine[];
  artifacts: DeskArtifact[];
};

type ChatStoreV2 = {
  active: Record<string, string>;
  threads: Record<string, ChatThread>;
};

export type AgentHistoryLine = { role: "user" | "assistant"; content: string };

function newId(prefix = "c") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function emptyStore(): ChatStoreV2 {
  return { active: {}, threads: {} };
}

function isArtifact(value: unknown): value is DeskArtifact {
  if (!value || typeof value !== "object") return false;
  const row = value as DeskArtifact;
  if (row.kind === "image") {
    return typeof row.id === "string" && typeof row.url === "string";
  }
  if (row.kind === "sheet") {
    return (
      typeof row.id === "string" &&
      Array.isArray(row.headers) &&
      Array.isArray(row.rows)
    );
  }
  return false;
}

function isChatLine(value: unknown): value is ChatLine {
  if (!value || typeof value !== "object") return false;
  const row = value as ChatLine;
  return (
    typeof row.id === "string" &&
    (row.role === "user" || row.role === "pet" || row.role === "system") &&
    typeof row.text === "string" &&
    typeof row.at === "number" &&
    (row.imageUrl === undefined || typeof row.imageUrl === "string")
  );
}

function migrateV1(): ChatStoreV2 {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(KEY_V1);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as ChatMap;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const store = emptyStore();
    for (const [petId, lines] of Object.entries(parsed)) {
      if (!Array.isArray(lines)) continue;
      const kept = lines.filter(isChatLine).slice(-MAX_PER_PET);
      if (!kept.length) continue;
      if (petId === DESK_ID && kept.every((line) => line.role === "system")) {
        continue;
      }
      const first = kept.find((line) => line.role === "user");
      const thread: ChatThread = {
        id: newId("t"),
        petId,
        title: (first?.text || "").trim().slice(0, 28) || "chat",
        createdAt: kept[0]?.at ?? Date.now(),
        updatedAt: kept[kept.length - 1]?.at ?? Date.now(),
        lines: kept,
        artifacts: kept
          .filter((line) => line.imageUrl)
          .map((line) => {
            const url = line.imageUrl!;
            const id = new URL(url, "http://local").searchParams.get("id") ?? line.id;
            return {
              kind: "image" as const,
              id,
              title: line.text || undefined,
              url,
            };
          }),
      };
      store.threads[thread.id] = thread;
      store.active[petId] = thread.id;
    }
    return store;
  } catch {
    return emptyStore();
  }
}

function loadStore(): ChatStoreV2 {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const migrated = migrateV1();
      if (Object.keys(migrated.threads).length) saveStore(migrated);
      return migrated;
    }
    const parsed = JSON.parse(raw) as ChatStoreV2;
    if (!parsed || typeof parsed !== "object" || !parsed.threads) {
      return emptyStore();
    }
    const threads: Record<string, ChatThread> = {};
    for (const [id, row] of Object.entries(parsed.threads)) {
      if (!row || typeof row !== "object") continue;
      threads[id] = {
        id,
        petId: typeof row.petId === "string" ? row.petId : "",
        title: typeof row.title === "string" ? row.title : "chat",
        createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
        updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : Date.now(),
        lines: Array.isArray(row.lines) ? row.lines.filter(isChatLine).slice(-MAX_PER_PET) : [],
        artifacts: Array.isArray(row.artifacts)
          ? row.artifacts.filter(isArtifact).slice(-MAX_ARTIFACTS)
          : [],
      };
    }
    return {
      active:
        parsed.active && typeof parsed.active === "object" ? parsed.active : {},
      threads,
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: ChatStoreV2) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function chatsFrom(store: ChatStoreV2): ChatMap {
  const map: ChatMap = {};
  for (const [petId, threadId] of Object.entries(store.active)) {
    const thread = store.threads[threadId];
    if (thread) map[petId] = thread.lines;
  }
  return map;
}

function ensureThread(store: ChatStoreV2, petId: string): ChatThread {
  const current = store.active[petId] ? store.threads[store.active[petId]!] : undefined;
  if (current) return current;
  const thread: ChatThread = {
    id: newId("t"),
    petId,
    title: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lines: [],
    artifacts: [],
  };
  store.threads[thread.id] = thread;
  store.active[petId] = thread.id;
  return thread;
}

export function loadChats(): ChatMap {
  return chatsFrom(loadStore());
}

export function loadChat(petId: string): ChatLine[] {
  return loadChats()[petId] ?? [];
}

export function saveChats(map: ChatMap) {
  const store = loadStore();
  for (const [petId, lines] of Object.entries(map)) {
    const thread = ensureThread(store, petId);
    thread.lines = lines.slice(-MAX_PER_PET);
    thread.updatedAt = Date.now();
  }
  saveStore(store);
}

export function appendChat(
  map: ChatMap,
  petId: string,
  role: ChatRole,
  text: string,
  extra?: { imageUrl?: string }
): ChatMap {
  const trimmed = text.trim().slice(0, MAX_TEXT);
  const imageUrl =
    extra?.imageUrl && extra.imageUrl.trim() ? extra.imageUrl.trim() : undefined;
  if (!petId || (!trimmed && !imageUrl)) return map;
  const store = loadStore();
  const thread = ensureThread(store, petId);
  const last = thread.lines[thread.lines.length - 1];
  if (
    last &&
    last.role === role &&
    last.text === trimmed &&
    last.imageUrl === imageUrl
  ) {
    return chatsFrom(store);
  }
  const line: ChatLine = {
    id: newId(),
    role,
    text: trimmed,
    at: Date.now(),
    imageUrl,
  };
  thread.lines = [...thread.lines, line].slice(-MAX_PER_PET);
  thread.updatedAt = line.at;
  if (!thread.title && role === "user" && trimmed) {
    thread.title = trimmed.slice(0, 28);
  }
  saveStore(store);
  return chatsFrom(store);
}

export function listThreads(petId: string): ChatRoomSnap[] {
  const store = loadStore();
  return Object.values(store.threads)
    .filter((thread) => thread.petId === petId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS)
    .map((thread) => ({
      id: thread.id,
      title: thread.title.trim() || "chat",
      updatedAt: thread.updatedAt,
    }));
}

export function activeThreadId(petId: string): string | undefined {
  return loadStore().active[petId];
}

export function loadArtifacts(petId: string): DeskArtifact[] {
  const store = loadStore();
  const id = store.active[petId];
  return id ? store.threads[id]?.artifacts ?? [] : [];
}

export function appendThreadArtifact(petId: string, artifact: DeskArtifact): ChatMap {
  const store = loadStore();
  const thread = ensureThread(store, petId);
  const exists = thread.artifacts.some(
    (row) => row.kind === artifact.kind && row.id === artifact.id
  );
  if (!exists) {
    thread.artifacts = [...thread.artifacts, artifact].slice(-MAX_ARTIFACTS);
    thread.updatedAt = Date.now();
    saveStore(store);
  }
  return chatsFrom(store);
}

export function newThread(petId: string): ChatMap {
  if (!petId) return loadChats();
  const store = loadStore();
  const prevId = store.active[petId];
  const prev = prevId ? store.threads[prevId] : undefined;
  if (prev && !prev.lines.length && !prev.artifacts.length) {
    delete store.threads[prev.id];
  }
  const thread: ChatThread = {
    id: newId("t"),
    petId,
    title: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lines: [],
    artifacts: [],
  };
  store.threads[thread.id] = thread;
  store.active[petId] = thread.id;
  const ids = Object.values(store.threads)
    .filter((row) => row.petId === petId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(MAX_THREADS)
    .map((row) => row.id);
  for (const id of ids) delete store.threads[id];
  saveStore(store);
  return chatsFrom(store);
}

export function switchThread(petId: string, threadId: string): ChatMap {
  const store = loadStore();
  const thread = store.threads[threadId];
  if (!thread || thread.petId !== petId) return chatsFrom(store);
  store.active[petId] = threadId;
  saveStore(store);
  return chatsFrom(store);
}

export function toAgentHistory(lines: ChatLine[]): AgentHistoryLine[] {
  return lines
    .filter((line) => line.role === "user" || line.role === "pet")
    .slice(-24)
    .map((line): AgentHistoryLine => ({
      role: line.role === "user" ? "user" : "assistant",
      content: line.imageUrl
        ? [line.text, `(image ${line.imageUrl})`].filter(Boolean).join("\n")
        : line.text,
    }))
    .filter((line) => line.content.trim());
}
