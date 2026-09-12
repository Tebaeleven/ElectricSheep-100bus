import { randomUUID } from "crypto";
import type { AgentSession } from "./types";

export type StoredArtifact = {
  id: string;
  mime: string;
  bytes: Buffer;
  title?: string;
  kind: "image" | "sheet";
};

const g = globalThis as typeof globalThis & {
  __pockassistSessions?: Map<string, AgentSession>;
  __pockassistArtifacts?: Map<string, StoredArtifact>;
  __pockassistMailDrafts?: Map<string, string>;
};

function map() {
  if (!g.__pockassistSessions) g.__pockassistSessions = new Map();
  return g.__pockassistSessions;
}

function artifacts() {
  if (!g.__pockassistArtifacts) g.__pockassistArtifacts = new Map();
  return g.__pockassistArtifacts;
}

function mailDrafts() {
  if (!g.__pockassistMailDrafts) g.__pockassistMailDrafts = new Map();
  return g.__pockassistMailDrafts;
}

export function putArtifact(
  row: Omit<StoredArtifact, "id"> & { id?: string }
): StoredArtifact {
  const stored: StoredArtifact = { ...row, id: row.id ?? randomUUID() };
  artifacts().set(stored.id, stored);
  return stored;
}

export function getArtifact(id: string) {
  return artifacts().get(id);
}

export function putMailDraft(messageId: string, text: string) {
  mailDrafts().set(messageId, text);
}

export function getMailDraft(messageId: string) {
  return mailDrafts().get(messageId);
}

export function getSession(id: string) {
  return map().get(id);
}

export function putSession(session: AgentSession) {
  map().set(session.id, session);
  return session;
}

export function deleteSession(id: string) {
  map().delete(id);
}

export function newSessionId() {
  return randomUUID();
}

export function resetPetSessions(petId?: string) {
  if (!petId) {
    map().clear();
    return;
  }
  for (const [id, session] of map()) {
    if (session.petId === petId) map().delete(id);
  }
}
