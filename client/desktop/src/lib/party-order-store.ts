"use client";

import { DEFAULT_PARTY_ORDER, sortByOrder } from "@/data/party";

const KEY = "pockassist.party-order.v1";

function knownIds(): string[] {
  return [...DEFAULT_PARTY_ORDER];
}

export function loadPartyOrder(): string[] {
  const fallback = knownIds();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const ids = parsed.filter((id): id is string => typeof id === "string");
    const seen = new Set<string>();
    const next: string[] = [];
    for (const id of ids) {
      if (!fallback.includes(id) || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    for (const id of fallback) {
      if (!seen.has(id)) next.push(id);
    }
    return next;
  } catch {
    return fallback;
  }
}

export function savePartyOrder(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function moveInOrder(order: string[], fromId: string, toId: string) {
  if (fromId === toId) return order;
  const from = order.indexOf(fromId);
  const to = order.indexOf(toId);
  if (from < 0 || to < 0) return order;
  const next = [...order];
  next.splice(from, 1);
  const insertAt = next.indexOf(toId);
  next.splice(insertAt < 0 ? next.length : insertAt, 0, fromId);
  return next;
}

export function applyPartyOrder<T extends { id: string }>(
  party: T[],
  order: string[]
) {
  return sortByOrder(party, order);
}

export const ACTIVE_SOFT_LIMIT = 3;

export function isActiveStatus(status: string) {
  return status !== "stopped" && status !== "empty";
}
