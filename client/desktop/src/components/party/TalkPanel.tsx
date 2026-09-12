"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import type { ChatLine, TalkAttachment, TalkPrompt } from "@/lib/talk";
import type { DeskArtifact } from "@/lib/agent/types";
import { loadArtifacts, loadChat } from "@/lib/chat-store";
import {
  attachmentPayload,
  dataUrlToAttachment,
  fileToAttachment,
} from "@/lib/talk-attach";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { useTypewriter } from "@/lib/hooks/use-typewriter";
import {
  WORK_MODE_IDS,
  parsePetConfig,
  type WorkMode,
} from "@/lib/pet-config";
import { configFor, loadConfigs, saveConfigs } from "@/lib/pet-config-store";
import { publishDeskConfig, subscribeDesk } from "@/lib/desk-channel";
import { resetAgentSessions } from "@/lib/agent/client";
import { isDeskTalk } from "@/lib/talk";
import { ensureMicPermission } from "@/lib/mic";

function speechEngine(): SpeechRecognition | null {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

type TalkPanelProps = {
  prompt: TalkPrompt;
  name: string;
  onChoice: (choiceId: string) => void;
  onSend: (text: string, attachments?: TalkAttachment[]) => void;
  onDraw?: (prompt: string, attachments?: TalkAttachment[]) => void;
  drawing?: boolean;
  hideName?: boolean;
  onNewChat?: () => void;
  onSwitchChat?: (roomId: string) => void;
  onOpenArtifact?: (artifact: DeskArtifact) => void;
  onDesk?: () => void;
  onClose?: () => void;
  className?: string;
  expanded?: boolean;
  /** Leave room on the left of the input so a pet sprite can sit there. */
  overlapPet?: boolean;
  /** Drag the Electron sticky window from the chat chrome. */
  dragWindow?: boolean;
};

function interactiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "button, textarea, input, select, a, video, label, [data-no-drag]"
    )
  );
}

function PaintIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M2.2 13.6c.2-2.2 1.2-3.4 2.6-4.8L11.6 2a1.7 1.7 0 0 1 2.4 2.4L7.2 11.2C5.8 12.6 4.4 13.6 2.2 13.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M10.4 3.2 12.8 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M3.1 12.6c.8-.1 1.5-.5 2-.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicIcon({ on }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
      <rect
        x="5.3"
        y="1.8"
        width="5.4"
        height="7.4"
        rx="2.7"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path
        d="M3.3 8.2a4.7 4.7 0 0 0 9.4 0M8 12.8v1.5M5.4 14.4h5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TalkPanel({
  prompt,
  name,
  onChoice,
  onSend,
  onDraw,
  drawing,
  hideName,
  onNewChat,
  onSwitchChat,
  onOpenArtifact,
  onDesk,
  onClose,
  className,
  expanded,
  overlapPet,
  dragWindow,
}: TalkPanelProps) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode>("agent");
  const [modeOpen, setModeOpen] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [attachments, setAttachments] = useState<TalkAttachment[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const recGen = useRef(0);
  const restartTimer = useRef<number | null>(null);
  const lastFinalRef = useRef("");
  const endBurst = useRef({ at: 0, n: 0 });
  const voiceOnRef = useRef(false);
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const historyRef = useRef<ChatLine[]>([]);
  const waitRef = useRef<{ len: number; sawBusy: boolean } | null>(null);
  const drag = useRef({
    x: 0,
    y: 0,
    active: false,
    moved: false,
    done: false,
  });
  const [dragging, setDragging] = useState(false);
  const busy = Boolean(drawing || prompt.streaming);
  const buttonsOnly = prompt.mode === "choice";
  const history = prompt.history ?? loadChat(prompt.petId);
  busyRef.current = busy;
  historyRef.current = history;
  const last = history[history.length - 1];
  const greeting =
    !history.length && prompt.text
      ? prompt.text
      : prompt.text && prompt.text !== last?.text
        ? prompt.text
        : null;
  const { shown, done, skip } = useTypewriter(greeting ?? "", {
    instant: Boolean(prompt.streaming) || !greeting,
  });
  const recentImages = history.filter((line) => line.imageUrl).slice(-6);
  const canSend = Boolean(draft.trim() || attachments.length) && !busy;
  const rooms = prompt.rooms ?? [];
  const artifacts = prompt.artifacts ?? loadArtifacts(prompt.petId);

  useEffect(() => {
    setDraft("");
    setAttachments([]);
    setPlusOpen(false);
    setRoomOpen(false);
    setFilesOpen(false);
    setModeOpen(false);
    const loaded = configFor(loadConfigs(), prompt.petId).workMode;
    setWorkMode(loaded === "image" && !onDraw ? "agent" : loaded);
  }, [prompt.petId, prompt.roomId]);

  useEffect(() => {
    return subscribeDesk((event) => {
      if (event.type === "config" && event.id === prompt.petId) {
        setWorkMode(parsePetConfig(event.config).workMode);
      }
    });
  }, [prompt.petId]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history.length, greeting, shown, prompt.detail, attachments.length]);

  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setCameraOn(false);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraOn]);

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const next: TalkAttachment[] = [];
    for (const file of Array.from(list).slice(0, 4 - attachments.length)) {
      next.push(await fileToAttachment(file));
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 4));
    setPlusOpen(false);
  };

  const addRecent = async (url: string) => {
    const att = await dataUrlToAttachment(url, t.talk.attachRecent);
    setAttachments((prev) => [...prev, att].slice(0, 4));
    setPlusOpen(false);
  };

  const snapCamera = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    void dataUrlToAttachment(dataUrl, t.talk.attachCamera).then((att) => {
      setAttachments((prev) => [...prev, att].slice(0, 4));
    });
    setCameraOn(false);
    setPlusOpen(false);
  };

  const payload = () => attachmentPayload(attachments);

  const persistWorkMode = (mode: WorkMode) => {
    setWorkMode(mode);
    setModeOpen(false);
    const petId = prompt.petId;
    const map = loadConfigs();
    const next = parsePetConfig({ ...configFor(map, petId), workMode: mode });
    saveConfigs({ ...map, [petId]: next });
    publishDeskConfig(petId, next);
    if (mode !== "image") {
      void resetAgentSessions(isDeskTalk(petId) ? undefined : petId);
    }
  };

  const submitNow = (text: string, fromVoice = false) => {
    const atts = payload();
    const trimmed = text.trim();
    if ((!trimmed && !atts.length) || busy) return;
    if (fromVoice) waitRef.current = { len: historyRef.current.length, sawBusy: false };
    if (workMode === "image" && onDraw) onDraw(trimmed, atts);
    else onSend(trimmed, atts);
    setDraft("");
    setAttachments([]);
    setPlusOpen(false);
    setModeOpen(false);
  };

  const sendDraft = () => submitNow(draft);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    sendDraft();
  };

  const clearRestart = () => {
    if (restartTimer.current != null) {
      window.clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  };

  const detachRec = () => {
    clearRestart();
    recGen.current += 1;
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
  };

  const startListening = () => {
    if (!voiceOnRef.current || speakingRef.current || waitRef.current || busyRef.current) {
      return;
    }
    if (recRef.current) return;
    void ensureMicPermission().then((ok) => {
      if (!ok || !voiceOnRef.current) {
        setVoiceOn(false);
        return;
      }
      if (recRef.current) return;
      const rec = speechEngine();
      if (!rec) {
        setVoiceOn(false);
        return;
      }
      const gen = recGen.current + 1;
      recGen.current = gen;
      rec.lang = locale === "ja" ? "ja-JP" : "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (ev) => {
        if (gen !== recGen.current) return;
        const parts: string[] = [];
        let final = "";
        for (let i = 0; i < ev.results.length; i += 1) {
          const row = ev.results[i];
          const piece = row?.[0]?.transcript ?? "";
          parts.push(piece);
          if (row && "isFinal" in row && row.isFinal) final += piece;
        }
        const shownText = (final || parts.join(" ")).trim();
        if (shownText) setDraft(shownText);
        const spoken = final.trim();
        if (!spoken || spoken === lastFinalRef.current) return;
        lastFinalRef.current = spoken;
        submitNow(spoken, true);
        detachRec();
      };
      rec.onerror = (ev) => {
        if (gen !== recGen.current) return;
        if (ev.error === "no-speech" || ev.error === "aborted") return;
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          setVoiceOn(false);
        }
      };
      rec.onend = () => {
        if (gen !== recGen.current) return;
        recRef.current = null;
        if (
          !voiceOnRef.current ||
          speakingRef.current ||
          waitRef.current ||
          busyRef.current
        ) {
          return;
        }
        const now = Date.now();
        if (now - endBurst.current.at < 1200) endBurst.current.n += 1;
        else endBurst.current.n = 0;
        endBurst.current.at = now;
        const delay = Math.min(2000, 200 * 2 ** Math.min(endBurst.current.n, 4));
        clearRestart();
        restartTimer.current = window.setTimeout(() => {
          restartTimer.current = null;
          startListening();
        }, delay);
      };
      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        recRef.current = null;
        clearRestart();
        restartTimer.current = window.setTimeout(() => {
          restartTimer.current = null;
          startListening();
        }, 400);
      }
    });
  };

  const speakThenListen = async (text: string) => {
    const say = text.trim();
    if (say && window.speechSynthesis) {
      speakingRef.current = true;
      detachRec();
      setListening(false);
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(say.slice(0, 280));
      utter.lang = locale === "ja" ? "ja-JP" : "en-US";
      utter.rate = 1.04;
      await new Promise<void>((resolve) => {
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      });
      speakingRef.current = false;
    }
    if (voiceOnRef.current && !waitRef.current && !busyRef.current) startListening();
  };

  useEffect(() => {
    voiceOnRef.current = voiceOn;
    if (!voiceOn) {
      detachRec();
      window.speechSynthesis?.cancel();
      setListening(false);
      waitRef.current = null;
      speakingRef.current = false;
      lastFinalRef.current = "";
      return;
    }
    if (busy || waitRef.current || speakingRef.current) {
      detachRec();
      setListening(false);
    } else {
      startListening();
    }
    const resume = () => {
      if (
        voiceOnRef.current &&
        !speakingRef.current &&
        !waitRef.current &&
        !busyRef.current
      ) {
        startListening();
      }
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      detachRec();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOn, busy, locale]);

  useEffect(() => {
    const wait = waitRef.current;
    if (!voiceOn || !wait) return;
    if (busy) {
      wait.sawBusy = true;
      return;
    }
    if (!wait.sawBusy && history.length <= wait.len + 1) return;
    waitRef.current = null;
    const line = [...history].reverse().find((row) => row.role === "pet");
    void speakThenListen(line?.text ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, history.length, voiceOn]);

  const toggleVoice = () => {
    if (voiceOn) {
      setVoiceOn(false);
      return;
    }
    void ensureMicPermission().then((ok) => {
      if (!ok) return;
      if (!speechEngine()) return;
      setVoiceOn(true);
    });
  };

  const onDraftKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const insert = "  ";
      const next = `${draft.slice(0, start)}${insert}${draft.slice(end)}`;
      setDraft(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + insert.length;
      });
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    sendDraft();
  };

  const finishWindowDrag = () => {
    if (drag.current.done) return;
    if (!drag.current.moved) {
      drag.current.active = false;
      return;
    }
    drag.current.done = true;
    drag.current.active = false;
    drag.current.moved = false;
    setDragging(false);
    window.petassist?.dragEnd();
  };

  const onWindowDragDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragWindow || e.button !== 0) return;
    if (interactiveTarget(e.target)) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      active: true,
      moved: false,
      done: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    const onUp = () => {
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("mouseup", onUp, true);
      finishWindowDrag();
    };
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("mouseup", onUp, true);
  };

  const onWindowDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragWindow || !drag.current.active || drag.current.done) return;
    const dist = Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y);
    if (dist > 4 && !drag.current.moved) {
      drag.current.moved = true;
      setDragging(true);
      window.petassist?.dragBegin();
    }
    if (drag.current.moved) {
      e.preventDefault();
      window.petassist?.dragMove();
    }
  };

  return (
    <div
      className={cn(
        "pet-no-drag relative flex w-[220px] flex-col rounded-2xl bg-white p-2.5 text-[#302c55] shadow-md",
        expanded && "h-full min-h-0 w-full max-w-none",
        dragWindow && (dragging ? "cursor-grabbing select-none" : "cursor-grab"),
        className
      )}
      onPointerDown={onWindowDragDown}
      onPointerMove={onWindowDragMove}
    >
      <div className="relative z-20 flex shrink-0 items-center gap-1">
        {onNewChat ? (
          <div className="relative">
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[13px] text-slate-500 hover:bg-slate-100"
              aria-label={t.talk.newChat}
              title={t.talk.chats}
              onClick={() => {
                setRoomOpen((open) => !open);
                setFilesOpen(false);
              }}
            >
              ✎
            </button>
            {roomOpen ? (
              <div className="absolute left-0 top-full z-30 mt-1 w-40 rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
                <button
                  type="button"
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold hover:bg-slate-50"
                  onClick={() => {
                    setRoomOpen(false);
                    onNewChat();
                  }}
                >
                  {t.talk.newChat}
                </button>
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    className={cn(
                      "block w-full truncate rounded-lg px-2 py-1 text-left text-[11px] hover:bg-slate-50",
                      room.id === prompt.roomId && "bg-slate-50 font-semibold"
                    )}
                    onClick={() => {
                      setRoomOpen(false);
                      onSwitchChat?.(room.id);
                    }}
                  >
                    {room.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {!hideName ? (
          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-500">
            {name}
          </p>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {onDesk ? (
          <button
            type="button"
            className="text-[10px] font-semibold text-slate-400 hover:text-[#302c55]"
            onClick={onDesk}
          >
            {t.talk.desk}
          </button>
        ) : null}
        {onOpenArtifact ? (
          <div className="relative">
            <button
              type="button"
              className="flex h-6 w-6 flex-col items-center justify-center gap-[2px] rounded-md text-slate-500 hover:bg-slate-100"
              aria-label={t.talk.files}
              onClick={() => {
                setFilesOpen((open) => !open);
                setRoomOpen(false);
              }}
            >
              <span className="block h-px w-3 bg-current" />
              <span className="block h-px w-3 bg-current" />
              <span className="block h-px w-3 bg-current" />
            </button>
            {filesOpen ? (
              <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200">
                <p className="px-1 pb-1 text-[9px] font-semibold text-slate-400">
                  {t.talk.files}
                </p>
                {artifacts.length ? (
                  <div className="grid max-h-40 grid-cols-3 gap-1 overflow-y-auto">
                    {artifacts.map((item) => (
                      <button
                        key={`${item.kind}-${item.id}`}
                        type="button"
                        className="h-12 overflow-hidden rounded-md bg-slate-100"
                        title={item.title || item.kind}
                        onClick={() => {
                          setFilesOpen(false);
                          onOpenArtifact(item);
                        }}
                      >
                        {item.kind === "image" ? (
                          <img src={item.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-[9px] font-semibold text-slate-500">
                            {t.talk.canvasSheet}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-1 py-2 text-[10px] text-slate-400">{t.talk.noFiles}</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {onClose ? (
          <button
            type="button"
            aria-label={t.talk.close}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[15px] font-light leading-none text-slate-400/40 transition hover:bg-slate-100 hover:text-slate-500"
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
      </div>
      <div
        ref={scrollerRef}
        className={cn(
          "mt-1 space-y-1.5 overflow-y-auto",
          expanded ? "min-h-0 flex-1" : "max-h-64",
          overlapPet && "pb-16"
        )}
        onClick={() => skip()}
      >
        {history.map((line, i) => (
          <ChatBubble
            key={line.id}
            line={line}
            name={name}
            you={t.talk.you}
            hideName={hideName}
            live={Boolean(
              prompt.streaming && i === history.length - 1 && line.role !== "user"
            )}
          />
        ))}
        {greeting ? (
          <p
            className={cn(
              "text-[12px] font-medium leading-snug whitespace-pre-wrap break-words",
              !done && "cursor-pointer"
            )}
          >
            {shown}
            {!done ? (
              <span className="ml-px inline-block h-[0.9em] w-px translate-y-px bg-[#302c55] align-baseline" />
            ) : null}
          </p>
        ) : null}
      </div>
      {prompt.detail ? (
        <p className="mt-1 max-h-24 shrink-0 overflow-auto rounded-lg bg-slate-50 p-1.5 font-mono text-[10px] leading-snug whitespace-pre-wrap break-words">
          {prompt.detail}
        </p>
      ) : null}
      {buttonsOnly && prompt.choices?.length ? (
        <div
          className={cn(
            "mt-2 flex shrink-0 flex-wrap gap-1",
            overlapPet && "pl-[6.75rem]"
          )}
        >
          {prompt.choices.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={
                c.id === "deny" || c.id === "cancel" || c.id === "refuse"
                  ? "outline"
                  : "default"
              }
              className="h-8 px-2 text-xs"
              onClick={() => onChoice(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      ) : null}
      {prompt.mode === "chat" && !expanded && !history.length && t.talk.tasks.length ? (
        <div className="mt-2 flex shrink-0 flex-col gap-1">
          {t.talk.tasks.map((task) => (
            <button
              key={task}
              type="button"
              className="rounded-lg bg-slate-50 px-2 py-1.5 text-left text-[11px] font-medium text-[#302c55] hover:bg-slate-100"
              onClick={() => onSend(task)}
            >
              {task}
            </button>
          ))}
        </div>
      ) : null}
      {cameraOn ? (
        <div className={cn("mt-2 shrink-0", overlapPet && "pl-[6.75rem]")}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-28 w-full rounded-xl bg-black object-cover"
          />
          <div className="mt-1 flex gap-1">
            <Button type="button" size="sm" className="h-7 px-2 text-[10px]" onClick={snapCamera}>
              {t.talk.shutter}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px]"
              onClick={() => setCameraOn(false)}
            >
              {t.talk.close}
            </Button>
          </div>
        </div>
      ) : null}
      {attachments.length ? (
        <div className={cn("mt-2 flex shrink-0 flex-wrap gap-1", overlapPet && "pl-[6.75rem]")}>
          {attachments.map((att) => (
            <button
              key={att.id}
              type="button"
              className="relative h-10 w-10 overflow-hidden rounded-lg bg-slate-100"
              onClick={() =>
                setAttachments((prev) => prev.filter((row) => row.id !== att.id))
              }
              title={att.name}
            >
              {att.kind === "image" && (att.dataUrl || att.url) ? (
                <img src={att.dataUrl || att.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="block px-1 text-[8px] leading-3 text-slate-500">
                  {att.name.slice(0, 8)}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}
      <div className={cn("relative mt-2 shrink-0", overlapPet && "pl-[6.75rem]")}>
        <div className="mb-1 flex items-center gap-1">
          <button
            type="button"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-[16px] font-light leading-none",
              plusOpen ? "bg-[#302c55] text-white" : "bg-slate-100 text-[#302c55]"
            )}
            aria-label={t.talk.attach}
            onClick={() => {
              setPlusOpen((open) => !open);
              setModeOpen(false);
            }}
          >
            +
          </button>
          <div className="relative">
            <button
              type="button"
              className={cn(
                "flex h-7 max-w-[7.5rem] items-center gap-0.5 rounded-full px-2 text-[10px] font-semibold",
                workMode === "agent"
                  ? "bg-slate-100 text-[#302c55]"
                  : "bg-[#302c55] text-white"
              )}
              aria-expanded={modeOpen}
              aria-label={t.talk.mode}
              title={t.talk.mode}
              onClick={() => {
                setModeOpen((open) => !open);
                setPlusOpen(false);
              }}
            >
              <span className="truncate">{t.talk.modes[workMode]}</span>
              <span className="text-[8px] opacity-70">▾</span>
            </button>
            {modeOpen ? (
              <div className="absolute bottom-full left-0 z-20 mb-1 min-w-[8.5rem] rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
                {WORK_MODE_IDS.filter((id) => id !== "image" || onDraw).map(
                  (id) => (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-slate-50",
                        workMode === id && "bg-slate-50 font-semibold text-[#302c55]"
                      )}
                      onClick={() => persistWorkMode(id)}
                    >
                      {id === "image" ? <PaintIcon /> : null}
                      {t.talk.modes[id]}
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full",
              voiceOn ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-500",
              listening && "animate-pulse"
            )}
            aria-pressed={voiceOn}
            aria-label={t.talk.voice}
            title={t.talk.voice}
            onClick={toggleVoice}
          >
            <MicIcon on={voiceOn} />
          </button>
        </div>
        {plusOpen ? (
          <div className="absolute bottom-full left-0 z-20 mb-1 min-w-[9.5rem] rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
            <button
              type="button"
              className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-slate-50"
              onClick={() => fileRef.current?.click()}
            >
              {t.talk.attachFile}
            </button>
            <button
              type="button"
              className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-slate-50"
              onClick={() => photoRef.current?.click()}
            >
              {t.talk.attachPhoto}
            </button>
            <button
              type="button"
              className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-slate-50"
              onClick={() => {
                setCameraOn(true);
                setPlusOpen(false);
              }}
            >
              {t.talk.attachCamera}
            </button>
            {recentImages.length ? (
              <div className="mt-1 flex flex-wrap gap-1 border-t border-slate-100 px-1 pt-1">
                {recentImages.map((line) => (
                  <button
                    key={line.id}
                    type="button"
                    className="h-8 w-8 overflow-hidden rounded-md bg-slate-100"
                    onClick={() => void addRecent(line.imageUrl!)}
                    title={t.talk.attachRecent}
                  >
                    <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <form
        className={cn(
          "flex shrink-0 items-end gap-1",
          overlapPet && "pl-[6.75rem]"
        )}
        onSubmit={submit}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onDraftKeyDown}
          placeholder={
            listening ? t.talk.listening : t.talk.modeHint[workMode]
          }
          rows={3}
          wrap="soft"
          disabled={busy}
          className="h-[4.25rem] min-w-0 flex-1 resize-none overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] leading-5 whitespace-pre-wrap outline-none focus:border-slate-400 disabled:opacity-60"
        />
        <Button
          type="submit"
          size="sm"
          className="h-8 px-2 text-xs"
          disabled={!canSend}
        >
          {busy && workMode === "image" ? "…" : t.talk.send}
        </Button>
      </form>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        multiple
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ChatBubble({
  line,
  name,
  you,
  live,
  hideName,
}: {
  line: ChatLine;
  name: string;
  you: string;
  live: boolean;
  hideName?: boolean;
}) {
  const { shown, done, skip } = useTypewriter(line.text, {
    instant: live || Boolean(line.imageUrl),
  });
  const user = line.role === "user";
  const system = line.role === "system";
  return (
    <div
      className={cn("flex flex-col gap-0.5", user && "items-end")}
      onClick={() => skip()}
    >
      {!system && !hideName ? (
        <p className="text-[9px] font-semibold text-slate-400">
          {user ? line.label ?? you : name}
        </p>
      ) : null}
      {line.imageUrl ? (
        <img
          src={line.imageUrl}
          alt={line.text || ""}
          className="mt-0.5 max-h-48 w-auto max-w-[95%] rounded-lg border border-slate-100 object-contain"
        />
      ) : null}
      {line.text ? (
        <p
          className={cn(
            "max-w-[95%] text-[12px] leading-snug whitespace-pre-wrap break-words",
            user && "rounded-lg bg-slate-50 px-2 py-1",
            system && "text-[11px] text-slate-500",
            !system && !user && "font-medium",
            live && !done && "cursor-pointer"
          )}
        >
          {shown}
          {live && !done ? (
            <span className="ml-px inline-block h-[0.9em] w-px translate-y-px bg-[#302c55] align-baseline" />
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
