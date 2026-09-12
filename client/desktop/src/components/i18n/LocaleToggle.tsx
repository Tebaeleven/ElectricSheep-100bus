"use client";

import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <div
      className={cn(
        "inline-flex shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold",
        className
      )}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        className={cn(
          "rounded-full px-2 py-0.5",
          locale === "en" ? "bg-white text-[#302c55] shadow-sm" : "text-slate-500"
        )}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={cn(
          "rounded-full px-2 py-0.5",
          locale === "ja" ? "bg-white text-[#302c55] shadow-sm" : "text-slate-500"
        )}
        onClick={() => setLocale("ja")}
      >
        日本語
      </button>
    </div>
  );
}
