"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { GhostSprite } from "@/components/ghost/GhostSprite";
import {
  CARE_ACTIONS,
  DEFAULT_WAKE_WORDS,
  GHOST,
  type GhostStatus,
} from "@/data/ghost";
import type { MoveDir } from "@/data/ghost-looks";
import {
  extractHttpUrls,
  wantsScreenshot,
} from "@/lib/desk-actions";
import {
  pickRecorderMime,
  readyMicStream,
  transcribeBlob,
} from "@/lib/mic";
import {
  GhostHarnessMenu,
  useGhostHarness,
  type GhostWorkMode,
} from "@/components/ghost/GhostHarness";
import {
  loadVoiceSample,
  loadWakeWords,
  saveVoiceSample,
  saveWakeWords,
  speakReply,
} from "@/lib/ghost-voice";
import { cn } from "@/lib/utils";
import type { GhostDeskMode } from "@/types/ghost-desktop";

type ChatLine = { id: string; role: "user" | "ghost"; text: string };
type Panel = "compact" | "talk" | "menu";

function speechCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function normalizeWake(s: string) {
  return s.toLowerCase().replace(/\s+/g, "");
}

export function GhostDeskApp({
  sticky = false,
  embedded = false,
}: {
  /** Electron /pet sticky: transparent chrome, drag, compact-first */
  sticky?: boolean;
  /** Nested in desk console — no full-viewport chrome / start gate */
  embedded?: boolean;
}) {
  const desk =
    typeof window !== "undefined"
      ? window.ghostDesktop ??
        (window.petassist
          ? {
              isDesk: true as const,
              resize: (mode: GhostDeskMode) =>
                window.petassist!.resizeSticky(
                  "ghost",
                  mode === "talk" ? "chat" : mode === "menu" ? "menu" : "compact"
                ),
              show: () => window.petassist!.showSticky("ghost"),
              dragBegin: () => window.petassist!.dragBegin(),
              dragMove: () => window.petassist!.dragMove(),
              dragEnd: () => window.petassist!.dragEnd(),
              onHotkey: () => () => {},
            }
          : undefined)
      : undefined;
  const isDesk = Boolean(sticky || desk?.isDesk);

  const [panel, setPanel] = useState<Panel>(
    embedded ? "talk" : isDesk ? "compact" : "talk"
  );
  const [status, setStatus] = useState<GhostStatus>("idle");
  const [lang, setLang] = useState<"ja" | "en">("ja");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(embedded);
  const [wakeDraft, setWakeDraft] = useState(DEFAULT_WAKE_WORDS.join(", "));
  const [hasSample, setHasSample] = useState(false);
  const [recording, setRecording] = useState(false);
  const [moveDir, setMoveDir] = useState<MoveDir>(null);
  const [eyeTick, setEyeTick] = useState(0);
  const [micBlocked, setMicBlocked] = useState(false);
  const [draft, setDraft] = useState("");
  const [workMode, setWorkMode] = useState<GhostWorkMode>("care");
  const harness = useGhostHarness(lang);
  const workModeRef = useRef(workMode);

  useEffect(() => {
    workModeRef.current = workMode;
  }, [workMode]);

  const recogRef = useRef<SpeechRecognition | null>(null);
  const listenRecRef = useRef<MediaRecorder | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listenChunksRef = useRef<Blob[]>([]);
  const mutedRef = useRef(false);
  const busyRef = useRef(false);
  const startedRef = useRef(false);
  const listenLoopRef = useRef(0);
  const panelRef = useRef(panel);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wakeRef = useRef<string[]>(DEFAULT_WAKE_WORDS);
  const lastDragX = useRef<number | null>(null);
  const langRef = useRef(lang);

  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    const saved = loadWakeWords();
    if (saved.length) {
      wakeRef.current = saved;
      setWakeDraft(saved.join(", "));
    }
    setHasSample(Boolean(loadVoiceSample()));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, busy]);

  // Loading: Normal (mouth closed) + eye cycle U→R→D→L while waiting / speaking
  useEffect(() => {
    if (!busy && !muted) return;
    const id = window.setInterval(() => {
      setEyeTick((n) => n + 1);
    }, 220);
    return () => window.clearInterval(id);
  }, [busy, muted]);

  const resizeDesk = useCallback(
    (mode: GhostDeskMode) => {
      void desk?.resize(mode);
    },
    [desk]
  );

  const openTalk = useCallback(() => {
    setPanel("talk");
    resizeDesk("talk");
  }, [resizeDesk]);

  const openMenu = useCallback(() => {
    setPanel("menu");
    resizeDesk("menu");
  }, [resizeDesk]);

  const toCompact = useCallback(() => {
    setPanel("compact");
    resizeDesk("compact");
  }, [resizeDesk]);

  const speakAndUnmute = useCallback(
    async (text: string) => {
      setMuted(true);
      await speakReply(text, lang, () => setMuted(false));
    },
    [lang]
  );

  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setLines((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", text: trimmed },
      ]);
      setBusy(true);
      setStatus("talking");
      setMuted(true);

      const openedUrls: string[] = [];
      for (const url of extractHttpUrls(trimmed)) {
        try {
          if (window.petassist?.openUrl) {
            const res = await window.petassist.openUrl(url);
            if (res?.ok) openedUrls.push(url);
          } else {
            window.open(url, "_blank", "noopener,noreferrer");
            openedUrls.push(url);
          }
        } catch {
          /* ignore open failures */
        }
      }

      let imageBase64: string | undefined;
      let imageMime: string | undefined;
      let didScreenshot = false;
      if (wantsScreenshot(trimmed)) {
        try {
          const shot = await window.petassist?.screenshot?.();
          if (shot?.ok && shot.base64) {
            imageBase64 = shot.base64;
            imageMime = shot.mime || "image/jpeg";
            didScreenshot = true;
          }
        } catch {
          /* ignore capture failures */
        }
      }

      try {
        if (workModeRef.current === "agent") {
          const out = await harness.runAgent({ message: trimmed });
          const reply =
            out.error ||
            out.text ||
            (lang === "ja" ? "……。" : "…");
          if (out.error) setStatus("failed");
          else setStatus("idle");
          setLines((prev) => [
            ...prev,
            { id: `g-${Date.now()}`, role: "ghost", text: reply },
          ]);
          await speakAndUnmute(reply);
          return;
        }

        const res = await fetch("/api/ghost/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            lang,
            imageBase64,
            imageMime,
            openedUrls,
            didScreenshot,
          }),
        });
        const data = (await res.json()) as { reply?: string; failed?: boolean };
        const reply =
          data.reply ??
          (lang === "ja" ? "……。" : "…");
        if (!res.ok || data.failed) setStatus("failed");
        else setStatus("idle");
        setLines((prev) => [
          ...prev,
          { id: `g-${Date.now()}`, role: "ghost", text: reply },
        ]);
        await speakAndUnmute(reply);
      } catch {
        setStatus("failed");
        setMuted(false);
      } finally {
        setBusy(false);
      }
    },
    [busy, lang, speakAndUnmute, harness]
  );

  const resolveApproval = useCallback(
    async (approval: "allow" | "deny") => {
      if (busy) return;
      setBusy(true);
      setStatus("talking");
      setMuted(true);
      setLines((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          role: "user",
          text: approval === "allow" ? "みとめる" : "だめ",
        },
      ]);
      try {
        const out = await harness.runAgent({ approval });
        const reply =
          out.error ||
          out.text ||
          (lang === "ja" ? "……。" : "…");
        if (out.error) setStatus("failed");
        else setStatus("idle");
        setLines((prev) => [
          ...prev,
          { id: `g-${Date.now()}`, role: "ghost", text: reply },
        ]);
        await speakAndUnmute(reply);
      } catch {
        setStatus("failed");
        setMuted(false);
      } finally {
        setBusy(false);
      }
    },
    [busy, harness, lang, speakAndUnmute]
  );

  const matchesWake = useCallback((transcript: string) => {
    const t = normalizeWake(transcript);
    return wakeRef.current.some((w) => t.includes(normalizeWake(w)));
  }, []);

  const stopRecog = useCallback(() => {
    try {
      recogRef.current?.stop();
    } catch {
      /* ignore */
    }
    recogRef.current = null;
    setListening(false);
  }, []);

  const startRecog = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor || mutedRef.current) return;
    stopRecog();
    const recog = new Ctor();
    recogRef.current = recog;
    recog.lang = lang === "ja" ? "ja-JP" : "en-US";
    recog.continuous = true;
    recog.interimResults = true;
    recog.onresult = (ev: SpeechRecognitionEvent) => {
      if (mutedRef.current) return;
      const text = ev.results[ev.results.length - 1]?.[0]?.transcript?.trim() ?? "";
      if (!text) return;
      const inTalk = panelRef.current === "talk";
      if (!inTalk) {
        if (matchesWake(text)) {
          openTalk();
          void sendChat(text);
        }
        return;
      }
      void sendChat(text);
    };
    recog.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      setListening(false);
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setStatus("failed");
      }
    };
    recog.onend = () => {
      setListening(false);
      if (!mutedRef.current && started) {
        setTimeout(() => startRecog(), 280);
      }
    };
    try {
      recog.start();
      setListening(true);
      setStatus((s) => (s === "failed" ? "idle" : s));
    } catch {
      setStatus("failed");
    }
  }, [lang, matchesWake, openTalk, sendChat, started, stopRecog]);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    void (async () => {
      const mic = await readyMicStream();
      if (cancelled) return;
      if (!mic.ok) {
        setMicBlocked(mic.reason === "denied");
        setStatus("failed");
        return;
      }
      if (!speechCtor()) {
        setStatus("failed");
        setLines((prev) => [
          ...prev,
          {
            id: `g-${Date.now()}`,
            role: "ghost",
            text:
              lang === "ja"
                ? "この環境では音声認識が使えないよ。文字で話してね。"
                : "Speech recognition isn’t available here. Type instead.",
          },
        ]);
        return;
      }
      startRecog();
    })();
    return () => {
      cancelled = true;
      stopRecog();
    };
  }, [started, startRecog, stopRecog, lang]);

  useEffect(() => {
    if (!desk?.onHotkey) return;
    return desk.onHotkey(() => {
      openTalk();
      setStarted(true);
    });
  }, [desk, openTalk]);

  const onSpritePointerDown = (e: ReactPointerEvent) => {
    if (!desk) return;
    e.preventDefault();
    lastDragX.current = e.clientX;
    desk.dragBegin();
    const move = (ev: PointerEvent) => {
      const prev = lastDragX.current;
      if (prev != null) {
        const dx = ev.clientX - prev;
        if (Math.abs(dx) > 2) setMoveDir(dx < 0 ? "L" : "R");
      }
      lastDragX.current = ev.clientX;
      desk.dragMove();
    };
    const up = () => {
      desk.dragEnd();
      lastDragX.current = null;
      setMoveDir(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const beginMic = async () => {
    const mic = await readyMicStream();
    setStarted(true);
    openTalk();
    if (!mic.ok) {
      setMicBlocked(mic.reason === "denied");
      setStatus("failed");
      setLines((prev) => [
        ...prev,
        {
          id: `g-${Date.now()}`,
          role: "ghost",
          text:
            lang === "ja"
              ? "マイクがオフになってるよ。システム設定で Electron（または Ghost Companion）のマイクをオンにしてね。"
              : "Microphone is blocked. Enable it for Electron / Ghost Companion in System Settings.",
        },
      ]);
      void window.petassist?.openMicSettings?.();
    } else {
      setMicBlocked(false);
    }
  };

  const onCare = (id: string, prompt: string | null) => {
    openTalk();
    void (async () => {
      const mic = await readyMicStream();
      setStarted(true);
      if (!mic.ok) {
        setMicBlocked(mic.reason === "denied");
        setStatus("failed");
        return;
      }
      if (prompt) void sendChat(prompt);
      else setStatus("talking");
    })();
  };

  const startSampleRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const url = typeof reader.result === "string" ? reader.result : null;
          saveVoiceSample(url);
          setHasSample(Boolean(url));
        };
        reader.readAsDataURL(blob);
        setRecording(false);
      };
      rec.start();
      setRecording(true);
      setTimeout(() => {
        if (mediaRecRef.current === rec && rec.state === "recording") rec.stop();
      }, 4000);
    } catch {
      setStatus("failed");
    }
  };

  const stopSampleRecord = () => {
    if (mediaRecRef.current?.state === "recording") {
      mediaRecRef.current.stop();
    }
  };

  const saveWake = () => {
    const words = wakeDraft
      .split(/[,、]/)
      .map((w) => w.trim())
      .filter(Boolean);
    wakeRef.current = words.length ? words : DEFAULT_WAKE_WORDS;
    saveWakeWords(wakeRef.current);
    setWakeDraft(wakeRef.current.join(", "));
  };

  const loading = busy || muted;
  // Mouth stays closed while loading; Open only after the wait ends and we're speaking.
  const mouthOpen = !loading && status === "talking";
  const floatSpeed = status === "talking" ? 2.4 : status === "failed" ? 5.2 : 4.2;
  const floatAmp = status === "failed" ? 3 : moveDir ? 2 : 6;

  const shellClass = cn(
    embedded
      ? "flex h-full min-h-0 flex-col bg-transparent text-[#302c55]"
      : isDesk && panel === "compact"
        ? "h-full w-full overflow-visible bg-transparent"
        : "min-h-[100dvh] bg-[#eef3f9] text-[#302c55] sm:min-h-0",
    isDesk &&
      !embedded &&
      panel !== "compact" &&
      "h-full min-h-0 overflow-hidden rounded-none bg-[#eef3f9]"
  );

  return (
    <div className={shellClass}>
      {!started && !embedded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#eef3f9]/95 p-6">
          <Button
            variant="care"
            size="care"
            className="max-w-sm"
            onClick={beginMic}
          >
            はじめる
          </Button>
        </div>
      )}

      {panel === "compact" && isDesk && !embedded ? (
        <button
          type="button"
          className="flex h-full w-full cursor-grab items-center justify-center bg-transparent p-0 active:cursor-grabbing"
          onPointerDown={onSpritePointerDown}
          onDoubleClick={() => {
            openTalk();
            setStarted(true);
          }}
          aria-label={GHOST.nameJa}
        >
          <GhostSprite
            status={status}
            moveDir={moveDir}
            loading={loading}
            mouthOpen={mouthOpen}
            eyeTick={eyeTick}
            floatAmp={floatAmp}
            floatSpeed={floatSpeed}
            sizeClassName="h-full w-auto max-h-full max-w-full"
            className={cn(
              status === "failed" && "opacity-90",
              status === "talking" &&
                "drop-shadow-[0_0_12px_rgba(229,107,140,0.45)]"
            )}
          />
        </button>
      ) : (
        <div
          className={cn(
            "mx-auto flex h-full w-full max-w-lg flex-col",
            isDesk ? "p-3" : "px-4 pb-8 pt-6"
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <button
              type="button"
              className="flex items-center gap-2"
              onPointerDown={isDesk ? onSpritePointerDown : undefined}
              onClick={() => {
                if (!isDesk) return;
              }}
              aria-label={GHOST.nameJa}
            >
              <GhostSprite
                status={status}
                moveDir={moveDir}
                loading={loading}
                mouthOpen={mouthOpen}
                eyeTick={eyeTick}
                floatAmp={4}
                floatSpeed={floatSpeed}
                sizeClassName="h-40 w-auto max-w-[11rem] sm:h-36"
                className={cn(
                  status === "failed" && "opacity-90",
                  status === "talking" &&
                    "drop-shadow-[0_0_12px_rgba(229,107,140,0.45)]"
                )}
              />
            </button>
            <div className="flex gap-2">
              {listening && (
                <span
                  className="mt-2 h-2.5 w-2.5 animate-pulse rounded-full bg-[#e56b8c]"
                  aria-hidden
                />
              )}
              <Button
                variant="careSoft"
                size="sm"
                className="text-xs"
                onClick={openMenu}
              >
                メニュー
              </Button>
              {isDesk && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-[#302c55]/70"
                  onClick={toCompact}
                >
                  とじる
                </Button>
              )}
            </div>
          </div>

          {panel === "menu" ? (
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-sm">
              <GhostHarnessMenu
                harnessLabel={harness.harnessLabel}
                grants={harness.grants}
                setGrants={harness.setGrants}
                deskAvailable={harness.deskAvailable}
                policyDraft={harness.policyDraft}
                setPolicyDraft={harness.setPolicyDraft}
                savePolicy={harness.savePolicy}
                workMode={workMode}
                setWorkMode={setWorkMode}
                onRefreshHarness={harness.refreshHarness}
              />
              <div>
                <p className="mb-2 text-sm font-medium text-[#302c55]">ことば</p>
                <div className="flex gap-2">
                  <Button
                    variant={lang === "ja" ? "care" : "careSoft"}
                    size="lg"
                    className="flex-1"
                    onClick={() => setLang("ja")}
                  >
                    JA
                  </Button>
                  <Button
                    variant={lang === "en" ? "care" : "careSoft"}
                    size="lg"
                    className="flex-1"
                    onClick={() => setLang("en")}
                  >
                    EN
                  </Button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-[#302c55]">よびかけ</p>
                <input
                  value={wakeDraft}
                  onChange={(e) => setWakeDraft(e.target.value)}
                  className="w-full rounded-xl border border-[#302c55]/20 bg-[#f7f8fb] px-3 py-3 text-base text-[#302c55] outline-none focus:border-[#e56b8c]"
                />
                <Button
                  variant="careSoft"
                  className="mt-2 w-full"
                  onClick={saveWake}
                >
                  保存
                </Button>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-[#302c55]">こえ</p>
                <div className="flex gap-2">
                  <Button
                    variant="care"
                    size="lg"
                    className="flex-1"
                    onClick={() =>
                      recording ? stopSampleRecord() : void startSampleRecord()
                    }
                  >
                    {recording ? "とめる" : "ろくおん"}
                  </Button>
                  <Button
                    variant="careSoft"
                    size="lg"
                    className="flex-1"
                    onClick={() => {
                      saveVoiceSample(null);
                      setHasSample(false);
                    }}
                  >
                    けす
                  </Button>
                </div>
                <div
                  className={cn(
                    "mt-3 h-2 rounded-full",
                    hasSample ? "bg-[#e56b8c]" : "bg-[#302c55]/15"
                  )}
                  aria-hidden
                />
              </div>
              <Button variant="careSoft" onClick={openTalk}>
                もどる
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex gap-2">
                <Button
                  variant={workMode === "care" ? "care" : "careSoft"}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setWorkMode("care")}
                >
                  おはなし
                </Button>
                <Button
                  variant={workMode === "agent" ? "care" : "careSoft"}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setWorkMode("agent")}
                >
                  おしごと · {harness.harnessLabel}
                </Button>
              </div>

              <div className="mb-4 space-y-3">
                {workMode === "care" ? (
                  CARE_ACTIONS.map((a) => (
                    <Button
                      key={a.id}
                      variant="care"
                      size="care"
                      onClick={() => onCare(a.id, a.prompt)}
                      disabled={busy}
                    >
                      {a.label}
                    </Button>
                  ))
                ) : (
                  <p className="rounded-2xl bg-white/80 px-3 py-3 text-sm leading-relaxed text-[#302c55]/75 shadow-sm">
                    おしごとモード。フォルダ権限と TrueForge
                    を使って任せてね。メニューから権限を変えられるよ。
                  </p>
                )}
                {harness.pendingApproval ? (
                  <div className="space-y-2 rounded-2xl border border-orange-200 bg-orange-50 p-3">
                    <p className="text-sm font-semibold text-[#302c55]">
                      しょうにんが必要
                    </p>
                    <p className="text-xs text-[#302c55]/70">
                      {harness.pendingApproval.tool}
                      {harness.pendingApproval.detail
                        ? ` · ${harness.pendingApproval.detail}`
                        : ""}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="care"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => void resolveApproval("allow")}
                      >
                        みとめる
                      </Button>
                      <Button
                        variant="careSoft"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => void resolveApproval("deny")}
                      >
                        だめ
                      </Button>
                    </div>
                  </div>
                ) : null}
                {micBlocked ? (
                  <div className="space-y-2">
                    <Button
                      variant="careSoft"
                      className="w-full"
                      onClick={() => void window.petassist?.openMicSettings?.()}
                    >
                      マイク設定を開く
                    </Button>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      一覧に Electron が見つからないときは、ターミナルで{" "}
                      <code className="rounded bg-black/5 px-1">
                        tccutil reset Microphone com.github.Electron
                      </code>{" "}
                      を実行してからアプリを再起動してね。
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl bg-white/80 p-3 shadow-sm">
                {lines.map((line) => (
                  <div
                    key={line.id}
                    className={cn(
                      "max-w-[90%] rounded-2xl px-3 py-2 text-base leading-relaxed sm:text-sm",
                      line.role === "user"
                        ? "ml-auto bg-[#e56b8c] text-white"
                        : "bg-[#f0f3f8] text-[#302c55]"
                    )}
                  >
                    {line.text}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = draft.trim();
                  if (!text) return;
                  setDraft("");
                  void sendChat(text);
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    workMode === "agent" ? "おしごとを任せる…" : "メッセージ…"
                  }
                  className="min-w-0 flex-1 rounded-xl border border-[#302c55]/15 bg-white px-3 py-3 text-base text-[#302c55] outline-none focus:border-[#e56b8c]"
                  disabled={busy}
                />
                <Button type="submit" variant="care" disabled={busy || !draft.trim()}>
                  送る
                </Button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
