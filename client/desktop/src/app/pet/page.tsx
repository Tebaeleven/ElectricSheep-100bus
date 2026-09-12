"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { PartySlot } from "@/components/party/PartySlot";
import { TalkPanel } from "@/components/party/TalkPanel";
import { INITIAL_PARTY, type PartyMember } from "@/data/party";
import {
  publishDeskHello,
  publishDeskTalkOpen,
  publishDeskTalkReply,
  publishDeskTalkNew,
  publishDeskTalkSwitch,
  subscribeDesk,
} from "@/lib/desk-channel";
import { openPreview } from "@/lib/preview";
import { useI18n } from "@/lib/i18n/locale";
import { talkWindowMode, type TalkPrompt } from "@/lib/talk";
import { cn } from "@/lib/utils";

function StickyPet() {
  const { t } = useI18n();
  const params = useSearchParams();
  const id = params.get("id");
  const seed = useMemo(
    () => INITIAL_PARTY.find((p) => p.id === id) ?? INITIAL_PARTY[0]!,
    [id]
  );
  const [member, setMember] = useState<PartyMember>(seed);
  const [prompt, setPrompt] = useState<TalkPrompt | null>(null);
  const [talkHidden, setTalkHidden] = useState(false);

  useEffect(() => {
    setMember(seed);
  }, [seed]);

  const mine = prompt?.petId === seed.id ? prompt : null;
  const name = t.pets[member.id]?.name ?? member.nameJa;
  const showing = Boolean(mine) && !talkHidden;
  const mode = talkWindowMode(showing ? mine : null);

  useEffect(() => {
    void window.petassist?.resizeSticky(seed.id, mode);
  }, [mode, seed.id]);

  useEffect(() => {
    const unsub = subscribeDesk((event) => {
      if (event.type === "status" && event.id === seed.id) {
        setMember((prev) => {
          if (prev.status === event.status) return prev;
          return {
            ...prev,
            status: event.status,
            progress: event.progress,
          };
        });
        return;
      }
      if (event.type === "looks" && event.id === seed.id) {
        setMember((prev) => ({
          ...prev,
          icon: event.icon,
          accent: event.accent,
        }));
        return;
      }
      if (event.type === "snapshot") {
        const row = event.members.find((m) => m.id === seed.id);
        if (row) {
          setMember((prev) => ({
            ...prev,
            status: row.status,
            progress: row.progress,
            icon: row.icon,
            accent: row.accent,
          }));
        }
        setPrompt(event.prompt?.petId === seed.id ? event.prompt : null);
        if (event.prompt?.petId === seed.id) setTalkHidden(false);
        return;
      }
      if (event.type === "talk") {
        const next = event.prompt?.petId === seed.id ? event.prompt : null;
        setPrompt(next);
        if (next) setTalkHidden(false);
      }
    });
    publishDeskHello();
    const retry = setTimeout(() => publishDeskHello(), 400);
    return () => {
      clearTimeout(retry);
      unsub();
    };
  }, [seed.id]);

  return (
    <main className="relative h-screen w-full overflow-hidden bg-transparent">
      <AnimatePresence>
        {showing && mine ? (
          <motion.div
            key="talk"
            className="absolute inset-0 z-0 p-2"
            initial={{ opacity: 0, scale: 0.56, x: -28, y: 36 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.72, x: -16, y: 20 }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 24,
              mass: 0.72,
            }}
            style={{ transformOrigin: "left bottom" }}
          >
            <TalkPanel
              expanded
              overlapPet
              hideName
              dragWindow
              className="h-full shadow-lg"
              prompt={mine}
              name={name}
              onClose={() => setTalkHidden(true)}
              onChoice={(choiceId) =>
                publishDeskTalkReply({
                  petId: seed.id,
                  kind: "choice",
                  choiceId,
                })
              }
              onSend={(text) =>
                publishDeskTalkReply({
                  petId: seed.id,
                  kind: "message",
                  text,
                })
              }
              onDraw={(text) =>
                publishDeskTalkReply({
                  petId: seed.id,
                  kind: "draw",
                  text,
                })
              }
              onNewChat={() => publishDeskTalkNew(seed.id)}
              onSwitchChat={(roomId) => publishDeskTalkSwitch(seed.id, roomId)}
              onOpenArtifact={(artifact) => openPreview(artifact, seed.id)}
              drawing={Boolean(mine.streaming)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div
        className={cn(
          "absolute z-10",
          showing ? "bottom-2 left-1" : "left-0 top-0"
        )}
      >
        <PartySlot
          member={member}
          sticky
          compact
          hideLabel
          suppressBubble={showing}
          onChat={() => {
            if (showing) {
              setTalkHidden(true);
              return;
            }
            setTalkHidden(false);
            if (!mine) publishDeskTalkOpen(seed.id);
          }}
          onMenuOpen={() => {
            if (mine?.mode === "choice" && showing) return false;
            if (showing) setTalkHidden(true);
          }}
        />
      </div>
    </main>
  );
}

export default function PetPage() {
  return (
    <Suspense>
      <StickyPet />
    </Suspense>
  );
}
