"use client";

import { cn } from "@/lib/utils";
import { useTypewriter } from "@/lib/hooks/use-typewriter";

type SpeechBubbleProps = {
  text: string | null;
  placement?: "above" | "below";
  className?: string;
  instant?: boolean;
  onTalk?: () => void;
};

export function HoverDots({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-0 z-20 h-10 w-12 -translate-x-1/2 -translate-y-1"
      aria-hidden
    >
      <span className="pet-hover-dot" />
      <span className="pet-hover-dot" />
      <span className="pet-hover-dot" />
    </div>
  );
}

export function SpeechBubble({
  text,
  placement = "above",
  className,
  instant,
  onTalk,
}: SpeechBubbleProps) {
  const below = placement === "below";
  const { shown, done, skip } = useTypewriter(text ?? "", {
    instant: instant ?? true,
  });

  if (!text) return null;

  return (
    <div
      key={text}
      role={onTalk ? "button" : undefined}
      tabIndex={onTalk ? 0 : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        skip();
        onTalk?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTalk?.();
        }
      }}
      className={cn(
        "pet-no-drag pet-bubble-in pointer-events-auto absolute left-1/2 z-20 max-h-24 max-w-[11rem] -translate-x-1/2 overflow-y-auto rounded-2xl bg-white px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug break-words text-[#302c55] shadow-md",
        below && "pet-bubble-in-below",
        onTalk && "cursor-pointer",
        below ? "top-full mt-1" : "bottom-full mb-1.5",
        className
      )}
    >
      {shown}
      {!done ? (
        <span className="ml-px inline-block h-[0.85em] w-px translate-y-px bg-[#302c55] align-baseline" />
      ) : null}
      <span
        className={cn(
          "absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white",
          below ? "-top-1" : "-bottom-1"
        )}
      />
    </div>
  );
}
