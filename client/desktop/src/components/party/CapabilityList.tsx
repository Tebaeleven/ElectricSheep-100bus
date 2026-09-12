"use client";

import { useI18n } from "@/lib/i18n/locale";
import { capabilitiesFor } from "@/lib/capabilities";
import { DEFAULT_GRANTS, type PetGrants } from "@/lib/grants";
import { DEFAULT_PET_CONFIG, type PetConfig } from "@/lib/pet-config";
import { cn } from "@/lib/utils";

type CapabilityListProps = {
  petId: string;
  grants?: PetGrants;
  config?: PetConfig;
  compact?: boolean;
  className?: string;
};

export function CapabilityList({
  petId,
  grants = DEFAULT_GRANTS,
  config = DEFAULT_PET_CONFIG,
  compact,
  className,
}: CapabilityListProps) {
  const { locale, t } = useI18n();
  const { can, cannot } = capabilitiesFor(petId, grants, t, locale, config);
  const text = compact ? "text-[11px]" : "text-xs";

  return (
    <div className={cn("space-y-2", className)}>
      <CapGroup
        ok
        heading={t.selected.can}
        items={can}
        text={text}
      />
      <CapGroup
        ok={false}
        heading={t.selected.cannot}
        items={cannot}
        text={text}
      />
    </div>
  );
}

function CapGroup({
  ok,
  heading,
  items,
  text,
}: {
  ok: boolean;
  heading: string;
  items: string[];
  text: string;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold tracking-wide text-slate-500">
        {heading}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className={cn("flex items-start gap-2", text, "text-[#302c55]")}>
            <CapIcon ok={ok} />
            <span className="leading-snug">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CapIcon({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white",
        ok ? "bg-emerald-500" : "bg-red-500"
      )}
      aria-hidden
    >
      {ok ? (
        <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none">
          <path
            d="M3.5 8.2 6.4 11l6.1-7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none">
          <path
            d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}
