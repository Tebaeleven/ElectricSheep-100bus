"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LocaleToggle } from "@/components/i18n/LocaleToggle";
import { useI18n } from "@/lib/i18n/locale";
import { useCompanion } from "@/lib/hooks/use-companion";
import { cn } from "@/lib/utils";

export function DockMenu() {
  const { t } = useI18n();
  const companion = useCompanion();
  const [open, setOpen] = useState(false);
  const [showSite, setShowSite] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowSite(!window.petassist);
    const h = window.location.hostname;
    setShowPhone(
      Boolean(window.petassist) || h === "localhost" || h === "127.0.0.1"
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={t.menu.hamburger}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl text-[#302c55]",
          "hover:bg-slate-100",
          open && "bg-slate-100"
        )}
      >
        <HamburgerIcon />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1 w-[200px] rounded-2xl bg-white p-1.5 shadow-lg"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold tracking-wide text-slate-400">
            {t.menu.language}
          </p>
          <div className="px-1.5 pb-1.5">
            <LocaleToggle className="w-full justify-center" />
          </div>
          {companion && showPhone ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full rounded-xl px-2.5 py-1.5 text-left text-[11px] font-medium text-[#302c55] hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                void companion.openPairSheet();
              }}
            >
              {companion.paired ? t.companion.connected : t.menu.connectPhone}
            </button>
          ) : null}
          {showSite ? (
            <Link
              href="/"
              role="menuitem"
              className="flex w-full rounded-xl px-2.5 py-1.5 text-left text-[11px] font-medium text-[#302c55] hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              {t.menu.site}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <path
        d="M2.5 4.25h11M2.5 8h11M2.5 11.75h11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
