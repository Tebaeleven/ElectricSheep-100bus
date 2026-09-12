"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { motion, useAnimationControls } from "framer-motion";
import { Button } from "@/components/ui/button";
import { spriteFor } from "@/data/looks";
import type { PartyMember } from "@/data/party";
import {
  joinCompanion,
  openCompanionEvents,
  postArrived,
  postCompanionMessage,
  postCompanionParcel,
  postLeap,
  unpairCompanion,
} from "@/lib/companion/client";
import { hopFrames } from "@/lib/companion/motion";
import { fileToParcel } from "@/lib/companion/parcel";
import {
  LEAP_DURATION_MS,
  MESSAGE_MAX_TEXT,
  MESSAGE_MAX_TRIPS,
  companionHistoryFor,
  parcelUrl,
  type CompanionChatLine,
  type CompanionPet,
  type CompanionThreads,
} from "@/lib/companion/protocol";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const TOKEN_KEY = "pockassist.companion.token";
const SPRITE = 112;
const REST_PAD = 16;

type Phase = "in" | "idle" | "out";
type StagePet = CompanionPet & { phase: Phase };

function asMember(pet: CompanionPet): PartyMember {
  return {
    id: pet.id,
    name: pet.id,
    nameJa: pet.id,
    role: "desk",
    icon: pet.icon,
    accent: pet.accent,
    progress: 0,
    tier: "L0",
    status: pet.status,
    allowedTools: [],
    deniedTools: [],
    bubbles: {
      idle: [],
      working: [],
      need_approval: [],
      stopped: [],
      failed: [],
      done: [],
      empty: [],
    },
  };
}

function mergeLine(
  prev: CompanionThreads,
  line: CompanionChatLine
): CompanionThreads {
  const existing = prev[line.petId] ?? [];
  if (existing.some((row) => row.msgId === line.msgId)) return prev;
  return { ...prev, [line.petId]: [...existing, line] };
}

export function PocketStage() {
  const { t } = useI18n();
  const params = useSearchParams();
  const codeParam = params.get("code") ?? "";
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState(codeParam);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [pets, setPets] = useState<StagePet[]>([]);
  const [threads, setThreads] = useState<CompanionThreads>({});
  const [composingId, setComposingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const roster = useRef(new Map<string, CompanionPet>());
  const entering = useRef(new Set<string>());
  const cancelledEnter = useRef(new Set<string>());
  const enterTimers = useRef<Record<string, number>>({});
  const [stageWidth, setStageWidth] = useState(
    typeof window === "undefined" ? 390 : window.innerWidth
  );

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(TOKEN_KEY);
      if (stored) setToken(stored);
    } catch {
      /* ignore */
    }
    const onResize = () => setStageWidth(window.innerWidth);
    setStageWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const remember = useCallback((next: string) => {
    setToken(next);
    try {
      sessionStorage.setItem(TOKEN_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const forget = useCallback(() => {
    setToken(null);
    setPets([]);
    setThreads({});
    setComposingId(null);
    setDraft("");
    roster.current.clear();
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const doJoin = useCallback(
    async (raw: string) => {
      setJoining(true);
      setError(null);
      const result = await joinCompanion(raw);
      setJoining(false);
      if (!result.ok) {
        setError(t.companion.invalidCode);
        return;
      }
      remember(result.token);
      for (const pet of result.pets) roster.current.set(pet.id, pet);
      setThreads(result.threads ?? {});
      setPets(
        result.pets
          .filter((p) => p.location === "phone")
          .map((p) => ({ ...p, phase: "in" as const }))
      );
    },
    [remember, t.companion.invalidCode]
  );

  useEffect(() => {
    if (token || !codeParam) return;
    void doJoin(codeParam);
  }, [codeParam, token, doJoin]);

  const startEnter = useCallback((pet: CompanionPet) => {
    if (cancelledEnter.current.has(pet.id)) return;
    if (entering.current.has(pet.id)) return;
    entering.current.add(pet.id);
    cancelledEnter.current.delete(pet.id);
    setPets((prev) => {
      if (prev.some((p) => p.id === pet.id)) {
        return prev.map((p) =>
          p.id === pet.id ? { ...pet, phase: "in" as const } : p
        );
      }
      return [...prev, { ...pet, phase: "in" as const }];
    });
    setComposingId(pet.id);
  }, []);

  const startExit = useCallback((id: string) => {
    const timer = enterTimers.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete enterTimers.current[id];
    }
    entering.current.delete(id);
    cancelledEnter.current.add(id);
    setPets((prev) =>
      prev.map((p) => (p.id === id && p.phase !== "out" ? { ...p, phase: "out" as const } : p))
    );
  }, []);

  useEffect(() => {
    if (!token) return;
    const close = openCompanionEvents(token, (event) => {
      if (event.type === "unpaired") {
        forget();
        return;
      }
      if (event.type === "snapshot") {
        for (const pet of event.pets) roster.current.set(pet.id, pet);
        if (event.threads) setThreads(event.threads);
        setPets((prev) => {
          const onPhone = new Set(
            event.pets
              .filter((p) => p.location === "phone" || p.location === "transit")
              .map((p) => p.id)
          );
          let next = prev.filter(
            (p) => onPhone.has(p.id) || p.phase === "out"
          );
          for (const pet of event.pets) {
            if (pet.location !== "phone") continue;
            if (next.some((p) => p.id === pet.id)) continue;
            if (entering.current.has(pet.id)) continue;
            entering.current.add(pet.id);
            next = [...next, { ...pet, phase: "in" }];
          }
          return next.map((p) => {
            const row = event.pets.find((x) => x.id === p.id);
            return row ? { ...p, ...row, phase: p.phase } : p;
          });
        });
        return;
      }
      if (event.type === "message") {
        setThreads((prev) => mergeLine(prev, event));
        setComposingId((current) => current ?? event.petId);
        return;
      }
      if (event.type === "leap" && event.to === "phone") {
        const pet = roster.current.get(event.id);
        if (!pet) return;
        cancelledEnter.current.delete(event.id);
        const delay = Math.max(0, event.t0 + event.overlapAt - Date.now());
        const prevTimer = enterTimers.current[event.id];
        if (prevTimer) window.clearTimeout(prevTimer);
        enterTimers.current[event.id] = window.setTimeout(() => {
          delete enterTimers.current[event.id];
          startEnter(pet);
        }, delay);
      }
      if (event.type === "leap" && event.to === "pc") {
        startExit(event.id);
      }
      if (event.type === "arrived" && event.location === "pc") {
        setPets((prev) => prev.filter((p) => p.id !== event.id));
        entering.current.delete(event.id);
      }
    });
    return close;
  }, [token, forget, startEnter, startExit]);

  const onEntered = useCallback(
    (id: string) => {
      entering.current.delete(id);
      if (cancelledEnter.current.has(id)) return;
      setPets((prev) =>
        prev.map((p) => (p.id === id ? { ...p, phase: "idle" as const } : p))
      );
      void postArrived({ id, location: "phone", token });
    },
    [token]
  );

  const onReturn = useCallback(
    (id: string) => {
      startExit(id);
      const t0 = Date.now();
      void postLeap({ id, from: "phone", to: "pc", token, t0 });
    },
    [token, startExit]
  );

  const onExited = useCallback((id: string) => {
    entering.current.delete(id);
    setPets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const pickPhoto = useCallback(
    async (id: string, file: File) => {
      const parcel = await fileToParcel(file);
      if (!parcel || !token) return;
      await postCompanionParcel({ id, ...parcel, token });
    },
    [token]
  );

  const sendNote = useCallback(
    async (id: string, text: string) => {
      const trimmed = text.trim().slice(0, MESSAGE_MAX_TEXT);
      if (!trimmed || !token) return;
      const current = roster.current.get(id);
      if (current?.asleep) return;
      const local: CompanionChatLine = {
        msgId: `local-${Date.now()}`,
        petId: id,
        from: "phone",
        text: trimmed,
        at: Date.now(),
      };
      setThreads((prev) => mergeLine(prev, local));
      setDraft("");
      const onStage = pets.some(
        (p) => p.id === id && (p.phase === "idle" || p.phase === "in")
      );
      if (onStage) startExit(id);
      const result = await postCompanionMessage({ id, text: trimmed, token });
      if (!result.ok) {
        if (result.error === "asleep") {
          setPets((prev) =>
            prev.map((p) => (p.id === id ? { ...p, asleep: true } : p))
          );
        }
        return;
      }
      setThreads((prev) => {
        const existing = prev[id] ?? [];
        const withoutLocal = existing.filter((row) => row.msgId !== local.msgId);
        if (withoutLocal.some((row) => row.msgId === result.line.msgId)) {
          return { ...prev, [id]: withoutLocal };
        }
        return { ...prev, [id]: [...withoutLocal, result.line] };
      });
      if (result.asleep) {
        setPets((prev) =>
          prev.map((p) => (p.id === id ? { ...p, asleep: true } : p))
        );
      }
    },
    [token, pets, startExit]
  );

  if (!token) {
    return (
      <main className="flex h-full flex-col justify-end px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="mb-auto">
          <p className="text-xs font-semibold tracking-wide text-[hsl(var(--primary))]">
            {t.brand.kicker}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#302c55]">
            {t.companion.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {t.companion.joinHint}
          </p>
        </div>
        <form
          className="rounded-3xl bg-white p-5 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void doJoin(code);
          }}
        >
          <label className="text-[11px] font-semibold text-slate-400">
            {t.companion.codeLabel}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              placeholder={t.companion.codePlaceholder}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="mt-2 block w-full rounded-2xl border border-slate-200 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-[#302c55] outline-none focus:border-[hsl(var(--primary))]"
            />
          </label>
          {error ? (
            <p className="mt-2 text-center text-[12px] text-red-600">{error}</p>
          ) : null}
          <Button type="submit" className="mt-4 w-full" disabled={joining || code.length < 6}>
            {t.companion.join}
          </Button>
        </form>
      </main>
    );
  }

  const shown = pets;
  const threadPet =
    (composingId && roster.current.get(composingId)) ??
    pets.find((p) => p.id === composingId) ??
    null;
  const threadLines = composingId ? threads[composingId] ?? [] : [];
  const history = companionHistoryFor(threadLines, "phone");
  const onStage =
    composingId != null &&
    pets.some((p) => p.id === composingId && p.phase !== "out");
  const hasThread = Boolean(composingId);
  const emptyStage = shown.length === 0 && !hasThread;

  return (
    <main className="relative h-full overflow-hidden">
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-[11px] font-semibold text-[#302c55]">
          {t.companion.connected}
        </p>
        <button
          type="button"
          className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm"
          onClick={() => {
            void unpairCompanion(token);
            forget();
          }}
        >
          {t.companion.disconnect}
        </button>
      </header>
      {emptyStage ? (
        <p className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-slate-400">
          {t.companion.empty}
        </p>
      ) : null}
      {pets.map((pet, index) => (
        <PocketPet
          key={pet.id}
          pet={pet}
          index={index}
          stageWidth={stageWidth}
          onEntered={onEntered}
          onExited={onExited}
          onOpen={(id) => {
            setComposingId(id);
            setDraft("");
          }}
        />
      ))}
      {composingId && threadPet ? (
        <PocketComposer
          name={t.pets[threadPet.id]?.name ?? threadPet.id}
          history={history}
          draft={draft}
          onDraft={setDraft}
          onSend={() => void sendNote(composingId, draft)}
          onReturn={onStage && !threadPet.asleep ? () => onReturn(composingId) : undefined}
          asleep={Boolean(threadPet.asleep)}
          trips={threadPet.trips ?? 0}
          thinking={
            !threadPet.asleep &&
            threadLines.length > 0 &&
            threadLines[threadLines.length - 1]?.from === "phone"
          }
          photoUrl={
            threadPet.parcel
              ? parcelUrl(threadPet.id, threadPet.parcel.at, token)
              : null
          }
          photoName={threadPet.parcel?.name}
          onPickPhoto={
            threadPet.asleep
              ? undefined
              : (file) => void pickPhoto(composingId, file)
          }
        />
      ) : null}
    </main>
  );
}

function PocketComposer({
  name,
  history,
  draft,
  onDraft,
  onSend,
  onReturn,
  asleep,
  trips,
  thinking,
  photoUrl,
  photoName,
  onPickPhoto,
}: {
  name: string;
  history: { id: string; role: string; text: string }[];
  draft: string;
  onDraft: (next: string) => void;
  onSend: () => void;
  onReturn?: () => void;
  asleep: boolean;
  trips: number;
  thinking: boolean;
  photoUrl: string | null;
  photoName?: string;
  onPickPhoto?: (file: File) => void;
}) {
  const { t } = useI18n();
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSend();
  };

  const onDraftKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    onSend();
  };

  return (
    <section className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="rounded-3xl bg-white/95 p-3 shadow-md backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-[#302c55]">{name}</p>
          <p className="text-[10px] text-slate-400">
            {asleep ? t.companion.asleep : t.companion.trips(trips, MESSAGE_MAX_TRIPS)}
          </p>
        </div>
        {asleep ? (
          <p className="mt-1 text-[12px] leading-snug text-slate-500">
            {t.companion.asleepHint}
          </p>
        ) : null}
        {photoUrl ? (
          <a href={photoUrl} target="_blank" rel="noreferrer" className="mt-2 block">
            <img
              src={photoUrl}
              alt={photoName ?? t.companion.photo}
              className="h-20 w-full rounded-xl object-cover"
            />
          </a>
        ) : null}
        <div
          ref={scrollerRef}
          className="mt-2 max-h-40 space-y-1.5 overflow-y-auto"
        >
          {history.length ? (
            history.map((line) => (
              <div
                key={line.id}
                className={cn(
                  "flex flex-col gap-0.5",
                  line.role === "user" && "items-end"
                )}
              >
                <p
                  className={cn(
                    "max-w-[90%] text-[12px] leading-snug whitespace-pre-wrap break-words",
                    line.role === "user" &&
                      "rounded-lg bg-slate-50 px-2 py-1 text-[#302c55]",
                    line.role !== "user" && "font-medium text-[#302c55]"
                  )}
                >
                  {line.text}
                </p>
              </div>
            ))
          ) : (
            <p className="text-[12px] text-slate-400">{t.companion.threadEmpty}</p>
          )}
          {thinking ? (
            <p className="text-[12px] font-medium text-slate-400">{t.companion.thinking}</p>
          ) : null}
        </div>
        {asleep ? null : (
          <form className="mt-2 flex items-end gap-1" onSubmit={submit}>
            {onPickPhoto ? (
              <label className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-[15px] text-slate-400">
                +
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) onPickPhoto(file);
                  }}
                />
              </label>
            ) : null}
            <textarea
              value={draft}
              onChange={(e) => onDraft(e.target.value.slice(0, MESSAGE_MAX_TEXT))}
              onKeyDown={onDraftKeyDown}
              placeholder={t.companion.messagePlaceholder}
              rows={2}
              wrap="soft"
              className="h-[3.25rem] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[13px] leading-5 outline-none focus:border-slate-400"
            />
            <Button type="submit" size="sm" className="h-8 px-3 text-xs" disabled={!draft.trim()}>
              {t.companion.send}
            </Button>
          </form>
        )}
        {onReturn && !asleep ? (
          <button
            type="button"
            className="mt-1.5 text-[11px] font-medium text-slate-400"
            onClick={onReturn}
          >
            {t.companion.returnToPc}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PocketPet({
  pet,
  index,
  stageWidth,
  onEntered,
  onExited,
  onOpen,
}: {
  pet: StagePet;
  index: number;
  stageWidth: number;
  onEntered: (id: string) => void;
  onExited: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const controls = useAnimationControls();
  const restY = 88 + index * (SPRITE + 28);
  const restX = Math.max(REST_PAD, stageWidth - SPRITE - REST_PAD);
  const portalX = stageWidth + 48;

  useEffect(() => {
    if (pet.phase === "idle") {
      void controls.set({ x: restX, y: 0 });
    }
  }, [pet.phase, controls, restX]);

  useEffect(() => {
    if (pet.phase !== "in") return;
    let cancelled = false;
    const hop = hopFrames(portalX, restX);
    void controls
      .start({
        x: hop.x,
        y: hop.y,
        transition: { duration: LEAP_DURATION_MS / 1000, ease: "linear" },
      })
      .then(() => {
        if (!cancelled) onEntered(pet.id);
      });
    return () => {
      cancelled = true;
    };
  }, [pet.phase, pet.id, controls, onEntered, portalX, restX]);

  useEffect(() => {
    if (pet.phase !== "out") return;
    let cancelled = false;
    const hop = hopFrames(restX, portalX);
    void controls
      .start({
        x: hop.x,
        y: hop.y,
        transition: { duration: LEAP_DURATION_MS / 1000, ease: "linear" },
      })
      .then(() => {
        if (!cancelled) onExited(pet.id);
      });
    return () => {
      cancelled = true;
    };
  }, [pet.phase, pet.id, controls, portalX, restX, onExited]);

  const name = t.pets[pet.id]?.name ?? pet.id;

  return (
    <motion.button
      type="button"
      className="absolute left-0 z-[1] touch-manipulation"
      style={{ top: restY }}
      animate={controls}
      initial={{ x: pet.phase === "in" ? portalX : restX, y: 0 }}
      onClick={() => {
        if (pet.phase !== "idle") return;
        onOpen(pet.id);
      }}
      aria-label={`${name} ${pet.asleep ? t.companion.asleep : t.companion.leaveMessage}`}
    >
      <img
        src={spriteFor(asMember(pet), { asleep: pet.asleep })}
        alt=""
        width={SPRITE}
        height={SPRITE}
        className="h-[112px] w-[112px] select-none object-contain object-bottom drop-shadow-md"
        draggable={false}
      />
      {pet.phase === "idle" ? (
        <span className="block text-center text-[10px] font-medium text-slate-400">
          {pet.asleep ? t.companion.asleep : t.companion.leaveMessage}
        </span>
      ) : null}
    </motion.button>
  );
}
