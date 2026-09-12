"use client";

import {
  defaultConfigFor,
  parsePetConfig,
  type PetConfig,
} from "@/lib/pet-config";

const KEY = "pockassist.config.v1";

export type ConfigMap = Record<string, PetConfig>;

export function loadConfigs(): ConfigMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: ConfigMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      out[id] = parsePetConfig(value);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveConfigs(map: ConfigMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function configFor(map: ConfigMap, petId: string): PetConfig {
  return map[petId] ? parsePetConfig(map[petId]) : defaultConfigFor(petId);
}
