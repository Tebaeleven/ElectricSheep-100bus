"use client";

import { useEffect, useState } from "react";
import type { DeskPins } from "@/types/petassist";

function asPins(value: unknown): DeskPins {
  if (Array.isArray(value)) return { pinned: value.filter((x) => typeof x === "string"), hidden: [] };
  if (value && typeof value === "object") {
    const rec = value as { pinned?: unknown; hidden?: unknown };
    return {
      pinned: Array.isArray(rec.pinned)
        ? rec.pinned.filter((x): x is string => typeof x === "string")
        : [],
      hidden: Array.isArray(rec.hidden)
        ? rec.hidden.filter((x): x is string => typeof x === "string")
        : [],
    };
  }
  return { pinned: [], hidden: [] };
}

export function useDesk() {
  const [available, setAvailable] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    const api = window.petassist;
    if (!api) return;
    setAvailable(true);
    void api.pinned().then((value) => {
      const pins = asPins(value);
      setPinned(pins.pinned);
      setHidden(pins.hidden);
    });
    return api.onPinned((state) => {
      setPinned(state.pinned);
      setHidden(state.hidden);
    });
  }, []);

  return {
    available,
    pinned,
    hidden,
    pin: (id: string) => window.petassist?.pin(id),
    pinAllTop: (ids?: string[], opts?: { confirm?: boolean }) =>
      window.petassist?.pinAllTop(ids, opts),
    unpin: (id: string) => window.petassist?.unpin(id),
    hideSticky: (id: string) => window.petassist?.hideSticky(id),
    leapPet: (id: string, motion: "in" | "out") =>
      window.petassist?.leapPet(id, motion),
    showSticky: (id: string) => window.petassist?.showSticky(id),
    showDock: () => window.petassist?.showDock(),
    openDirectory: () => window.petassist?.openDirectory() ?? Promise.resolve(null),
  };
}
