"use client";

import { useState } from "react";
import { PartySlot } from "@/components/party/PartySlot";
import type { PartyMember } from "@/data/party";
import { cn } from "@/lib/utils";

type PartyBarProps = {
  party: PartyMember[];
  selectedId?: string | null;
  pinnedIds?: string[];
  tearOff?: boolean;
  onSelect?: (id: string) => void;
  onChat?: (id: string) => void;
  onMenuOpen?: (id: string) => boolean | void;
  onReorder?: (fromId: string, toId: string) => void;
  talkingId?: string | null;
  hiddenIds?: string[];
  awayIds?: string[];
  transparent?: boolean;
  compact?: boolean;
  className?: string;
};

export function PartyBar({
  party,
  selectedId,
  pinnedIds,
  tearOff,
  onSelect,
  onChat,
  onMenuOpen,
  onReorder,
  talkingId,
  hiddenIds,
  awayIds,
  transparent,
  compact,
  className,
}: PartyBarProps) {
  const [overId, setOverId] = useState<string | null>(null);

  return (
    <div
      className={cn(
          "relative z-20 flex items-end justify-center gap-0.5 overflow-visible px-1 pb-2 pt-8",
        !transparent &&
          "rounded-2xl border border-white/60 bg-white/80 shadow-lg backdrop-blur-md",
        className
      )}
    >
      {party.map((m) => (
        <div
          key={m.id}
          draggable={Boolean(onReorder)}
          onDragStart={(e) => {
            const fromSprite = (e.target as HTMLElement | null)?.closest?.(
              "[data-pet-sprite]"
            );
            if (fromSprite) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData("text/pet-id", m.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            if (!onReorder) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setOverId(m.id);
          }}
          onDragLeave={() => {
            setOverId((id) => (id === m.id ? null : id));
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOverId(null);
            const fromId = e.dataTransfer.getData("text/pet-id");
            if (fromId) onReorder?.(fromId, m.id);
          }}
          onDragEnd={() => setOverId(null)}
          className={cn(
            "rounded-2xl transition",
            overId === m.id && "ring-2 ring-pink-200"
          )}
        >
          <PartySlot
            member={m}
            selected={selectedId === m.id}
            compact={compact}
            pinned={pinnedIds?.includes(m.id)}
            hidden={hiddenIds?.includes(m.id)}
            away={awayIds?.includes(m.id)}
            tearOff={tearOff}
            suppressBubble={talkingId === m.id}
            onSelect={onSelect}
            onChat={onChat}
            onMenuOpen={onMenuOpen}
          />
        </div>
      ))}
    </div>
  );
}
