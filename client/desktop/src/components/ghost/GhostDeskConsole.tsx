"use client";

import { useCallback, useState } from "react";
import { PartyBar } from "@/components/party/PartyBar";
import { GhostDeskApp } from "@/components/ghost/GhostDeskApp";
import { INITIAL_PARTY, type PartyMember } from "@/data/party";
import { useDesk } from "@/lib/hooks/use-desk";
import { cn } from "@/lib/utils";

/**
 * Petassist-style desk: frosted party dock at the bottom + care talk panel.
 */
export function GhostDeskConsole() {
  const desk = useDesk();
  const [party] = useState<PartyMember[]>(INITIAL_PARTY);
  const [selectedId, setSelectedId] = useState<string>("ghost");
  const [talkOpen, setTalkOpen] = useState(false);

  const openTalk = useCallback(
    (id: string) => {
      setSelectedId(id);
      setTalkOpen(true);
      if (desk.available) {
        void desk.showSticky(id);
        void window.petassist?.resizeSticky(id, "chat");
      }
    },
    [desk]
  );

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#eef3f9] text-[#302c55]">
      <header className="flex items-center justify-between px-5 py-4">
        <p className="text-sm font-semibold tracking-wide">Ghost Companion</p>
        <button
          type="button"
          className="rounded-xl border border-[#302c55]/15 bg-white px-3 py-2 text-xs font-medium shadow-sm"
          onClick={() => setTalkOpen((v) => !v)}
        >
          {talkOpen ? "とじる" : "はなす"}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-36">
        {talkOpen ? (
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/70 bg-white/70 shadow-sm">
            <GhostDeskApp embedded />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center opacity-60">
            {/* empty desk — pets live in the dock / sticky */}
          </div>
        )}
      </main>

      <div className="sticky bottom-3 z-30 mt-auto overflow-visible px-3">
        <PartyBar
          party={party}
          selectedId={selectedId}
          pinnedIds={desk.pinned}
          hiddenIds={desk.hidden}
          tearOff={desk.available}
          talkingId={talkOpen ? selectedId : null}
          onSelect={(id) => setSelectedId(id)}
          onChat={(id) => openTalk(id)}
          className={cn(!desk.available && "mx-auto max-w-sm")}
        />
      </div>
    </div>
  );
}
