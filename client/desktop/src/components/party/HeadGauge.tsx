"use client";

import { cn } from "@/lib/utils";
import { gaugeFill } from "@/data/looks";
import type { PartyStatus } from "@/data/party";

type HeadGaugeProps = {
  progress: number;
  status: PartyStatus;
  accent: string;
  wide?: boolean;
};

export function HeadGauge({
  progress,
  status,
  accent,
  wide,
}: HeadGaugeProps) {
  const pct = Math.min(100, Math.max(0, progress));
  const fill = gaugeFill(status, accent);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-full bg-black/15",
        wide ? "h-2 w-14" : "h-1.5 w-10"
      )}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, backgroundColor: fill }}
      />
    </div>
  );
}
