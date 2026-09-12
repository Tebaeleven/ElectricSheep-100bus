"use client";

import { DEFAULT_GRANTS, parseGrants, type PetGrants } from "@/lib/grants";

const KEY = "pockassist.grants.v1";

export type GrantsMap = Record<string, PetGrants>;

export function loadGrants(): GrantsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: GrantsMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      out[id] = parseGrants(value);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveGrants(map: GrantsMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function grantsFor(map: GrantsMap, petId: string): PetGrants {
  return map[petId] ? parseGrants(map[petId]) : { ...DEFAULT_GRANTS };
}
