"use client";

const KEY = "pockassist.looks.v1";

export type PetLook = { icon: string; accent: string };
export type LooksMap = Record<string, PetLook>;

export function loadLooks(): LooksMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LooksMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLooks(map: LooksMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function upsertLook(
  prev: LooksMap,
  id: string,
  patch: Partial<PetLook>
): LooksMap {
  const next = {
    ...prev,
    [id]: { icon: patch.icon ?? prev[id]?.icon ?? "", accent: patch.accent ?? prev[id]?.accent ?? "" },
  };
  saveLooks(next);
  return next;
}
