"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { PartyBar } from "@/components/party/PartyBar";
import { TalkPanel } from "@/components/party/TalkPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DockMenu } from "@/components/demo/DockMenu";
import { PairSheet } from "@/components/companion/PairSheet";
import { CompanionProvider, useCompanion } from "@/lib/hooks/use-companion";
import { postCompanionMessage } from "@/lib/companion/client";
import {
  companionHistoryFor,
  type CompanionChatLine,
  type CompanionThreads,
} from "@/lib/companion/protocol";
import { useDesk } from "@/lib/hooks/use-desk";
import {
  publishDeskSnapshot,
  publishDeskStatus,
  publishDeskTalk,
  publishDeskTalkOpen,
  publishDeskGrants,
  publishDeskConfig,
  subscribeDesk,
} from "@/lib/desk-channel";
import { loadLooks } from "@/lib/looks-store";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/locale";
import type { ChatRole, TalkPrompt } from "@/lib/talk";
import { DESK_ID, isDeskTalk } from "@/lib/talk";
import {
  appendChat,
  appendThreadArtifact,
  loadArtifacts,
  loadChats,
  listThreads,
  activeThreadId,
  newThread,
  switchThread,
  toAgentHistory,
  type ChatMap,
} from "@/lib/chat-store";
import {
  asksForFolderGrant,
  hasFolderAccess,
  needsDisk,
  parseAllowSpeech,
  petMeetsNeed,
  routeTask,
  rerouteDirectTalk,
  wantsLocalFiles,
  withNeedToolsEnabled,
  type TaskNeed,
} from "@/lib/dispatch";
import { ArtifactCanvas } from "@/components/demo/ArtifactCanvas";
import { openPreview } from "@/lib/preview";
import {
  fetchHarnessStatus,
  streamAgentTurn,
  type HarnessStatus,
  type TurnOutcome,
} from "@/lib/agent/client";
import { isSendTool } from "@/lib/agent/types";
import type { DeskArtifact } from "@/lib/agent/types";
import { GrantPicker } from "@/components/party/GrantPicker";
import { CapabilityList } from "@/components/party/CapabilityList";
import { grantsFor, loadGrants, saveGrants, type GrantsMap } from "@/lib/grants-store";
import { configFor, loadConfigs, saveConfigs, type ConfigMap } from "@/lib/pet-config-store";
import { parsePetConfig } from "@/lib/pet-config";
import type { PetGrants } from "@/lib/grants";
import {
  INITIAL_PARTY,
  type PartyMember,
  type PartyStatus,
} from "@/data/party";
import {
  ACTIVE_SOFT_LIMIT,
  applyPartyOrder,
  isActiveStatus,
  loadPartyOrder,
  moveInOrder,
  savePartyOrder,
} from "@/lib/party-order-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const FAIL_REVERT_MS = 5000;

type PendingDispatch = {
  petId: string;
  need: TaskNeed;
  text: string;
  prevStatus: PartyStatus;
};

type LogLine = { t: string; text: string };

function stamp(locale: string) {
  return new Date().toLocaleTimeString(locale === "ja" ? "ja-JP" : "en-GB", {
    hour12: false,
  });
}

function imageUrlOf(artifact: DeskArtifact) {
  if (artifact.kind !== "image") return undefined;
  return artifact.url || `/api/agent/artifact?id=${encodeURIComponent(artifact.id)}`;
}

export function DemoConsole({ embedded = false }: { embedded?: boolean }) {
  const { locale, t } = useI18n();
  const [party, setParty] = useState<PartyMember[]>(INITIAL_PARTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [artifact, setArtifact] = useState<DeskArtifact | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [pendingPost, setPendingPost] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<TalkPrompt | null>(null);
  const [busy, setBusy] = useState<{
    body: string;
    run: () => void;
  } | null>(null);
  const [harness, setHarness] = useState<HarnessStatus | null>(null);
  const [grantsMap, setGrantsMap] = useState<GrantsMap>({});
  const [configMap, setConfigMap] = useState<ConfigMap>({});
  const [chats, setChats] = useState<ChatMap>({});
  const desk = useDesk();
  const partyRef = useRef(party);
  const promptRef = useRef(prompt);
  const pendingRef = useRef(pendingPost);
  const sessionsRef = useRef<Record<string, string>>({});
  const sessionKeyFor = (petId: string) =>
    `${petId}:${activeThreadId(petId) ?? ""}`;
  const failTimers = useRef<Record<string, number>>({});
  const progressFlush = useRef<
    Record<string, { t: number; timer: number | null; progress: number }>
  >({});
  const pendingDispatchRef = useRef<PendingDispatch | null>(null);
  const lastJobRef = useRef<{ petId: string; message: string } | null>(null);
  const pickingFolderRef = useRef(false);
  const grantRetryKeyRef = useRef<string | null>(null);
  const promptedFolderRef = useRef<string | null>(null);
  const grantsMapRef = useRef(grantsMap);
  grantsMapRef.current = grantsMap;
  const configMapRef = useRef(configMap);
  configMapRef.current = configMap;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const seenImagesRef = useRef(new Set<string>());
  const drawingRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const pocketThreadsRef = useRef<CompanionThreads>({});
  const seenPocketRef = useRef(new Set<string>());
  const pendingPocketTalkRef = useRef(new Set<string>());
  const localeRef = useRef(locale);
  const tRef = useRef(t);
  partyRef.current = party;
  promptRef.current = prompt;
  pendingRef.current = pendingPost;
  localeRef.current = locale;
  tRef.current = t;

  useEffect(() => {
    const timers = failTimers.current;
    const flush = progressFlush.current;
    const syncPause = () =>
      document.documentElement.classList.toggle("pet-paused", document.hidden);
    document.addEventListener("visibilitychange", syncPause);
    syncPause();
    return () => {
      document.removeEventListener("visibilitychange", syncPause);
      for (const id of Object.keys(timers)) window.clearTimeout(timers[id]);
      for (const id of Object.keys(flush)) {
        if (flush[id]?.timer) window.clearTimeout(flush[id]!.timer!);
      }
    };
  }, []);

  useEffect(() => {
    const looks = loadLooks();
    const order = loadPartyOrder();
    setParty((prev) =>
      applyPartyOrder(
        prev.map((p) => {
          const look = looks[p.id];
          return look
            ? { ...p, icon: look.icon || p.icon, accent: look.accent || p.accent }
            : p;
        }),
        order
      )
    );
  }, []);

  useEffect(() => {
    setGrantsMap(loadGrants());
    setConfigMap(loadConfigs());
    setChats(loadChats());
  }, []);

  useEffect(() => {
    setLogs([{ t: stamp(locale), text: t.log.ready }]);
  }, [locale, t.log.ready]);

  useEffect(() => {
    void fetchHarnessStatus().then(setHarness);
  }, []);

  const petName = (id: string) =>
    tRef.current.pets[id]?.name ??
    partyRef.current.find((p) => p.id === id)?.nameJa ??
    id;

  const allowChoices = (send = false) => [
    { id: "allow", label: send ? tRef.current.talk.sendOut : tRef.current.talk.allow },
    { id: "deny", label: tRef.current.talk.deny },
  ];

  const elevateChoices = () => [
    { id: "permit", label: tRef.current.talk.permit },
    { id: "refuse", label: tRef.current.talk.refuse },
    { id: "custom", label: tRef.current.talk.custom },
  ];

  const pushLog = (text: string) =>
    setLogs((prev) => [{ t: stamp(localeRef.current), text }, ...prev].slice(0, 40));

  const remember = (
    petId: string,
    role: ChatRole,
    text: string,
    extra?: { imageUrl?: string }
  ) => {
    const next = appendChat(chatsRef.current, petId, role, text, extra);
    chatsRef.current = next;
    setChats(next);
    return next[petId] ?? [];
  };

  const threadOf = (petId: string) => chatsRef.current[petId] ?? [];

  const setPetGrants = (id: string, next: PetGrants) => {
    setGrantsMap((prev) => {
      const map = { ...prev, [id]: next };
      grantsMapRef.current = map;
      saveGrants(map);
      return map;
    });
    publishDeskGrants(id, next);
  };

  const promptFolderGrant = async (petId: string) => {
    if (pickingFolderRef.current) return false;
    pickingFolderRef.current = true;
    setSelectedId(petId);
    try {
      const current = grantsFor(grantsMapRef.current, petId);
      const picked = window.petassist
        ? await window.petassist.openDirectory()
        : null;
      if (!picked) {
        if (!window.petassist && current.sandbox === "read_only") {
          setPetGrants(petId, {
            sandbox: "workspace",
            folders: current.folders,
          });
        }
        return false;
      }
      setPetGrants(petId, {
        sandbox: current.sandbox === "full_access" ? "full_access" : "workspace",
        folders: [...new Set([...current.folders, picked])],
      });
      pushLog(tRef.current.log.granted(petName(petId), picked));
      return true;
    } finally {
      pickingFolderRef.current = false;
    }
  };

  const ensureFolderGrant = async (petId: string, message: string) => {
    if (!wantsLocalFiles(message)) return;
    lastJobRef.current = { petId, message };
    if (hasFolderAccess(grantsFor(grantsMapRef.current, petId))) return;
    const key = `${petId}:${message}`;
    if (promptedFolderRef.current === key) return;
    promptedFolderRef.current = key;
    const ask = tRef.current.talk.needFolder(petName(petId));
    remember(petId, "pet", ask);
    pushTalk({ petId, mode: "alert", text: ask });
    await promptFolderGrant(petId);
  };

  const followUpFolderGrant = (petId: string, out: TurnOutcome) => {
    const talk = `${out.text ?? ""}\n${out.error ?? ""}`;
    if (!out.grant && !asksForFolderGrant(talk)) return;
    const job = lastJobRef.current;
    const key = job ? `${job.petId}:${job.message}` : `${petId}:ask`;
    if (grantRetryKeyRef.current === key && !out.grant) return;
    void (async () => {
      const granted = await promptFolderGrant(petId);
      if (!granted || job?.petId !== petId) return;
      grantRetryKeyRef.current = key;
      await runPet(petId, { message: job.message });
    })();
  };

  const pushTalk = (next: TalkPrompt | null, opts?: { fresh?: boolean }) => {
    const prompt = next
      ? {
          ...next,
          history:
            next.channel === "pocket"
              ? (next.history ??
                companionHistoryFor(
                  pocketThreadsRef.current[next.petId] ?? [],
                  "pc",
                  { phone: tRef.current.companion.fromPhone }
                ))
              : chatsRef.current[next.petId] ?? [],
          fresh: opts?.fresh,
          ...(next.channel === "pocket" || isDeskTalk(next.petId)
            ? {}
            : {
                roomId: activeThreadId(next.petId),
                rooms: listThreads(next.petId),
                artifacts: loadArtifacts(next.petId),
              }),
        }
      : null;
    setPrompt(prompt);
    publishDeskTalk(prompt);
  };

  const keepArtifact = (petId: string, artifact: DeskArtifact) => {
    if (!artifact.id) return;
    appendThreadArtifact(petId, artifact);
    if (seenImagesRef.current.has(`open:${artifact.id}`)) return;
    seenImagesRef.current.add(`open:${artifact.id}`);
    openPreview(artifact, petId);
  };

  const showChatImage = (petId: string, artifact: DeskArtifact) => {
    const url = imageUrlOf(artifact);
    if (!url || artifact.kind !== "image") return;
    if (seenImagesRef.current.has(artifact.id)) return;
    seenImagesRef.current.add(artifact.id);
    remember(petId, "pet", artifact.title || tRef.current.talk.canvasImage, {
      imageUrl: url,
    });
    keepArtifact(petId, artifact);
    setCanvasOpen(false);
    pushTalk({ petId, mode: "chat", text: "" });
  };

  const applyPermitConfig = (petId: string, need: TaskNeed) => {
    const next = withNeedToolsEnabled(
      configFor(configMapRef.current, petId),
      need
    );
    const map = { ...configMapRef.current, [petId]: next };
    configMapRef.current = map;
    setConfigMap(map);
    saveConfigs(map);
    publishDeskConfig(petId, next);
    const pet = partyRef.current.find((p) => p.id === petId);
    if (pet?.status === "stopped") setStatus(petId, "idle");
    return next;
  };

  const dispatchMessage = async (text: string) => {
    const first = routeTask(
      text,
      partyRef.current,
      grantsMapRef.current,
      configMapRef.current
    );
    await ensureFolderGrant(first.petId, text);
    const route = routeTask(
      text,
      partyRef.current,
      grantsMapRef.current,
      configMapRef.current
    );
    if (route.ok) {
      remember(route.petId, "user", text);
      pushTalk({ petId: route.petId, mode: "chat", text: "" });
      pushLog(tRef.current.log.dispatched(petName(route.petId), text));
      await runPet(route.petId, { message: text });
      return;
    }
    const grants = grantsFor(grantsMapRef.current, route.petId);
    const config = configFor(configMapRef.current, route.petId);
    if (
      petMeetsNeed(route.petId, route.need, grants, config, {
        ignoreStopped: true,
      })
    ) {
      const current = partyRef.current.find((p) => p.id === route.petId);
      if (current?.status === "stopped" || current?.status === "empty") {
        setStatus(route.petId, "idle");
      }
      remember(route.petId, "user", text);
      pushTalk({ petId: route.petId, mode: "chat", text: "" });
      pushLog(tRef.current.log.dispatched(petName(route.petId), text));
      await runPet(route.petId, { message: text });
      return;
    }
    const current = partyRef.current.find((p) => p.id === route.petId);
    pendingDispatchRef.current = {
      petId: route.petId,
      need: route.need,
      text,
      prevStatus: current?.status ?? "idle",
    };
    setSelectedId(route.petId);
    setStatus(route.petId, "need_approval");
    pushTalk({
      petId: DESK_ID,
      mode: "choice",
      text: tRef.current.talk.elevate(
        petName(route.petId),
        tRef.current.talk.needs[route.need]
      ),
      choices: elevateChoices(),
    });
  };

  const handleElevateChoice = async (choiceId: string) => {
    const pending = pendingDispatchRef.current;
    pendingDispatchRef.current = null;
    if (choiceId === "refuse") {
      if (pending) setStatus(pending.petId, pending.prevStatus);
      setSelectedId(null);
      pushTalk({
        petId: DESK_ID,
        mode: "chat",
        text: tRef.current.talk.dispatchDenied,
      });
      return;
    }
    if (!pending) return;
    if (choiceId === "custom") {
      setStatus(
        pending.petId,
        pending.prevStatus === "stopped" ? "stopped" : "idle"
      );
      setSelectedId(pending.petId);
      remember(
        pending.petId,
        "system",
        tRef.current.talk.elevateCustom(petName(pending.petId))
      );
      pushTalk({
        petId: pending.petId,
        mode: "alert",
        text: tRef.current.talk.elevateCustom(petName(pending.petId)),
      });
      return;
    }
    if (choiceId !== "permit") return;
    const next = applyPermitConfig(pending.petId, pending.need);
    const grants = grantsFor(grantsMapRef.current, pending.petId);
    if (
      !petMeetsNeed(pending.petId, pending.need, grants, next, {
        ignoreStopped: true,
      })
    ) {
      if (needsDisk(pending.need)) {
        const ask = tRef.current.talk.needFolder(petName(pending.petId));
        remember(pending.petId, "pet", ask);
        pushTalk({ petId: pending.petId, mode: "alert", text: ask });
        const granted = await promptFolderGrant(pending.petId);
        const after = grantsFor(grantsMapRef.current, pending.petId);
        if (
          granted &&
          petMeetsNeed(pending.petId, pending.need, after, next, {
            ignoreStopped: true,
          })
        ) {
          pushLog(tRef.current.log.dispatched(petName(pending.petId), pending.text));
          remember(pending.petId, "user", pending.text);
          pushTalk({ petId: pending.petId, mode: "chat", text: "" });
          await runPet(pending.petId, { message: pending.text });
          return;
        }
      }
      setStatus(
        pending.petId,
        pending.prevStatus === "stopped" ? "stopped" : "idle"
      );
      setSelectedId(pending.petId);
      remember(
        pending.petId,
        "system",
        tRef.current.talk.elevateCustom(petName(pending.petId))
      );
      pushTalk({
        petId: pending.petId,
        mode: "alert",
        text: tRef.current.talk.elevateCustom(petName(pending.petId)),
      });
      return;
    }
    pushLog(tRef.current.log.dispatched(petName(pending.petId), pending.text));
    remember(pending.petId, "user", pending.text);
    pushTalk({ petId: pending.petId, mode: "chat", text: "" });
    await runPet(pending.petId, { message: pending.text });
  };

  const setStatus = (id: string, status: PartyStatus) => {
    const prevTimer = failTimers.current[id];
    if (prevTimer) {
      window.clearTimeout(prevTimer);
      delete failTimers.current[id];
    }
    if (status === "failed" || status === "done") {
      const reverting = status;
      failTimers.current[id] = window.setTimeout(() => {
        delete failTimers.current[id];
        const current = partyRef.current.find((p) => p.id === id);
        if (current?.status === reverting) setStatus(id, "idle");
      }, FAIL_REVERT_MS);
    }
    setParty((prev) => {
      const current = prev.find((p) => p.id === id);
      if (!current) return prev;
      let progress = current.progress;
      if (status === "stopped") progress = 0;
      if (status === "need_approval") progress = Math.max(current.progress, 88);
      if (status === "working" && current.progress < 8) progress = 8;
      if (current.status === status && current.progress === progress) return prev;
      publishDeskStatus(id, status, progress);
      return prev.map((p) => (p.id === id ? { ...p, status, progress } : p));
    });
  };

  const applyProgress = (id: string, progress: number) => {
    setParty((prev) => {
      const current = prev.find((p) => p.id === id);
      if (!current || current.progress === progress) return prev;
      publishDeskStatus(id, current.status, progress);
      return prev.map((p) => (p.id === id ? { ...p, progress } : p));
    });
  };

  const setProgress = (id: string, progress: number) => {
    const slot = progressFlush.current[id] ?? {
      t: 0,
      timer: null as number | null,
      progress,
    };
    slot.progress = progress;
    const now = Date.now();
    const wait = 150 - (now - slot.t);
    const flushNow = wait <= 0 || progress >= 100;
    if (flushNow) {
      if (slot.timer != null) {
        window.clearTimeout(slot.timer);
        slot.timer = null;
      }
      slot.t = now;
      progressFlush.current[id] = slot;
      applyProgress(id, progress);
      return;
    }
    progressFlush.current[id] = slot;
    if (slot.timer == null) {
      slot.timer = window.setTimeout(() => {
        slot.timer = null;
        slot.t = Date.now();
        applyProgress(id, slot.progress);
      }, wait);
    }
  };

  const applyOutcome = (petId: string, out: TurnOutcome) => {
    if (out.sessionId) sessionsRef.current[sessionKeyFor(petId)] = out.sessionId;
    if (out.runtime) {
      setHarness((prev) =>
        prev ? { ...prev, runtime: out.runtime ?? prev.runtime } : prev
      );
    }
    if (out.error) {
      setStatus(petId, "failed");
      remember(petId, "pet", out.error);
      pushTalk({ petId, mode: "alert", text: out.error });
      pushLog(tRef.current.log.error(out.error));
      followUpFolderGrant(petId, out);
      return false;
    }
    if (out.approval) {
      setPendingPost(out.approval.detail);
      setStatus(petId, "need_approval");
      setProgress(petId, 88);
      remember(petId, "pet", out.approval.text);
      const send = isSendTool(out.approval.toolName);
      pushTalk(
        {
          petId,
          mode: "choice",
          text: out.approval.text,
          detail:
            out.approval.toolName === "desk_organize"
              ? undefined
              : out.approval.detail,
          choices: out.approval.choices?.length
            ? out.approval.choices
            : allowChoices(send),
        }
      );
      return true;
    }
    if (out.artifact) {
      setArtifact(out.artifact);
      setCanvasOpen(false);
      if (out.artifact.kind === "image") {
        showChatImage(petId, out.artifact);
      } else {
        remember(
          petId,
          "pet",
          out.artifact.title || tRef.current.talk.canvasSheet
        );
        keepArtifact(petId, out.artifact);
        pushTalk({ petId, mode: "chat", text: "" });
      }
    }
    setProgress(petId, 100);
    setStatus(petId, "done");
    if (out.text) {
      remember(petId, "pet", out.text);
      pushTalk({ petId, mode: "alert", text: out.text });
      pushLog(`${petName(petId)}: ${out.text}`);
    }
    followUpFolderGrant(petId, out);
    return true;
  };

  const configForTurn = (petId: string) => {
    const base = configFor(configMapRef.current, petId);
    const talkId = promptRef.current?.petId;
    if (!talkId || talkId === petId) return base;
    const talkMode = configFor(configMapRef.current, talkId).workMode;
    return parsePetConfig({ ...base, workMode: talkMode });
  };

  const runPet = async (
    petId: string,
    input: { message?: string; approval?: "allow" | "deny"; choiceId?: string }
  ): Promise<TurnOutcome> => {
    const turnConfig = configForTurn(petId);
    if (input.message && turnConfig.workMode === "agent") {
      await ensureFolderGrant(petId, input.message);
    }
    setSelectedId(petId);
    setStatus(petId, "working");
    let out: TurnOutcome;
    try {
      out = await streamAgentTurn(
      {
        petId,
        locale: localeRef.current,
        sessionId: sessionsRef.current[sessionKeyFor(petId)],
        message: input.message,
        history: toAgentHistory(threadOf(petId)),
        approval: input.approval,
        choiceId: input.choiceId,
        grants: grantsFor(grantsMapRef.current, petId),
        config: turnConfig,
      },
      (event, partial) => {
        if (partial.progress) setProgress(petId, partial.progress);
        if (partial.sessionId) {
          sessionsRef.current[sessionKeyFor(petId)] = partial.sessionId;
        }
        if (event.type === "handoff") {
          setSelectedId(event.to);
        }
        if (event.type === "artifact") {
          setArtifact(event);
          setCanvasOpen(false);
          if (event.kind === "image") {
            showChatImage(petId, event);
          } else {
            keepArtifact(petId, event);
          }
        }
        if (event.type === "text" && partial.text && !partial.approval) {
          if (/そとにだして|OK to send|このアプリを開いて/i.test(partial.text)) {
            return;
          }
          pushTalkRef.current({
            petId,
            mode: "chat",
            text: partial.text,
            streaming: true,
          });
        }
      }
    );
    } catch (err) {
      out = {
        text: "",
        progress: 0,
        error:
          err instanceof Error &&
          err.message !== "fetch failed" &&
          err.message !== "Failed to fetch"
            ? err.message
            : localeRef.current === "en"
              ? "Couldn't reach the desk."
              : "デスクに届かなかったよ。",
      };
    }
    applyOutcome(out.actorId ?? petId, out);
    return out;
  };

  const drawInChat = async (fromId: string, promptText: string) => {
    const text = promptText.trim();
    if (!text || drawingRef.current) return;
    const petId = isDeskTalk(fromId)
      ? selectedIdRef.current ??
        partyRef.current.find((p) => isActiveStatus(p.status))?.id ??
        partyRef.current[0]?.id ??
        fromId
      : fromId;
    drawingRef.current = true;
    setDrawingId(petId);
    remember(petId, "user", text);
    pushTalk({
      petId,
      mode: "chat",
      text: tRef.current.talk.drawing,
      streaming: true,
    });
    setSelectedId(petId);
    setStatus(petId, "working");
    try {
      const res = await fetch("/api/agent/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          config: configFor(configMapRef.current, petId),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        title?: string;
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.id || !json.url) {
        const fail = json.error || tRef.current.talk.drawFailed;
        remember(petId, "pet", fail);
        pushTalk({ petId, mode: "alert", text: fail });
        setStatus(petId, "failed");
        return;
      }
      const artifact: DeskArtifact = {
        kind: "image",
        id: json.id,
        title: json.title,
        url: json.url,
      };
      setArtifact(artifact);
      showChatImage(petId, artifact);
      setStatus(petId, "done");
    } catch {
      const fail = tRef.current.talk.drawFailed;
      remember(petId, "pet", fail);
      pushTalk({ petId, mode: "alert", text: fail });
      setStatus(petId, "failed");
    } finally {
      drawingRef.current = false;
      setDrawingId(null);
    }
  };

  const handleReply = (
    petId: string,
    kind: "choice" | "message" | "draw",
    choiceId?: string,
    text?: string
  ) => {
    void (async () => {
      if (kind === "draw") {
        await drawInChat(petId, text ?? "");
        return;
      }
      if (kind === "choice") {
        if (
          choiceId === "permit" ||
          choiceId === "refuse" ||
          choiceId === "custom"
        ) {
          await handleElevateChoice(choiceId);
          return;
        }
        if (choiceId === "allow" || choiceId === "deny") {
          remember(
            petId,
            "user",
            choiceId === "allow"
              ? tRef.current.talk.allow
              : tRef.current.talk.deny
          );
          const out = await runPet(petId, {
            approval: choiceId === "allow" ? "allow" : "deny",
          });
          if (out.error) return;
          if (choiceId === "allow") {
            pushLog(
              tRef.current.log.allow(petName(petId), pendingRef.current ?? "")
            );
          } else {
            pushLog(tRef.current.log.deny(petName(petId)));
          }
          setPendingPost(null);
          return;
        }
        if (!choiceId) return;
        remember(petId, "user", choiceId);
        pushLog(tRef.current.log.instructed(petName(petId), choiceId));
        await runPet(petId, { choiceId });
        return;
      }
      if (!text) return;
      if (promptRef.current?.channel === "pocket") {
        const pocketId = promptRef.current.petId;
        const posted = await postCompanionMessage({ id: pocketId, text });
        if (!posted.ok) return;
        const prev = pocketThreadsRef.current[pocketId] ?? [];
        const thread = prev.some((row) => row.msgId === posted.line.msgId)
          ? prev
          : [...prev, posted.line];
        pocketThreadsRef.current[pocketId] = thread;
        seenPocketRef.current.add(posted.line.msgId);
        pushTalk({
          petId: pocketId,
          mode: posted.asleep ? "alert" : "chat",
          channel: "pocket",
          text: posted.asleep ? tRef.current.companion.asleepHint : "",
          history: companionHistoryFor(thread, "pc", {
            phone: tRef.current.companion.fromPhone,
          }),
        });
        if (posted.asleep) setStatus(pocketId, "done");
        return;
      }
      const waitingAllow =
        promptRef.current?.mode === "choice" &&
        Boolean(
          promptRef.current.choices?.some(
            (c) => c.id === "allow" || c.id === "deny"
          )
        );
      const spoken = parseAllowSpeech(text);
      if ((waitingAllow || pendingRef.current) && spoken) {
        remember(
          petId,
          "user",
          spoken === "allow" ? tRef.current.talk.allow : tRef.current.talk.deny
        );
        const out = await runPet(petId, { approval: spoken });
        if (out.error) return;
        if (spoken === "allow") {
          pushLog(
            tRef.current.log.allow(petName(petId), pendingRef.current ?? "")
          );
        } else {
          pushLog(tRef.current.log.deny(petName(petId)));
        }
        setPendingPost(null);
        return;
      }
      if (isDeskTalk(petId)) {
        await dispatchMessage(text);
        return;
      }
      remember(petId, "user", text);
      pushTalk({ petId, mode: "chat", text: "" });
      const dest = rerouteDirectTalk(
        petId,
        text,
        configFor(configMapRef.current, petId)
      );
      if (dest.handed) {
        const line = tRef.current.talk.handoff(petName(petId), petName(dest.petId));
        remember(petId, "pet", line);
        pushTalk({ petId, mode: "alert", text: line });
        pushLog(tRef.current.log.dispatched(petName(dest.petId), text));
        await runPet(dest.petId, { message: text });
        return;
      }
      pushLog(tRef.current.log.instructed(petName(petId), text));
      await runPet(petId, { message: text });
    })();
  };

  const resetPetChatSession = (petId: string) => {
    for (const key of Object.keys(sessionsRef.current)) {
      if (key === petId || key.startsWith(`${petId}:`)) {
        delete sessionsRef.current[key];
      }
    }
    void fetch("/api/agent/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ petId }),
    });
  };

  const startNewChat = (petId: string) => {
    if (!petId || isDeskTalk(petId)) return;
    const next = newThread(petId);
    chatsRef.current = next;
    setChats(next);
    resetPetChatSession(petId);
    pushTalk({ petId, mode: "chat", text: tRef.current.talk.ask });
  };

  const switchChatRoom = (petId: string, roomId: string) => {
    if (!petId || isDeskTalk(petId)) return;
    const next = switchThread(petId, roomId);
    chatsRef.current = next;
    setChats(next);
    resetPetChatSession(petId);
    pushTalk({ petId, mode: "chat", text: "" });
  };

  const handleReplyRef = useRef(handleReply);
  handleReplyRef.current = handleReply;
  const pushTalkRef = useRef(pushTalk);
  pushTalkRef.current = pushTalk;
  const runPetRef = useRef(runPet);
  runPetRef.current = runPet;
  const startNewChatRef = useRef(startNewChat);
  startNewChatRef.current = startNewChat;
  const switchChatRoomRef = useRef(switchChatRoom);
  switchChatRoomRef.current = switchChatRoom;
  const pocketBusyRef = useRef(new Set<string>());

  const runPocketBot = async (petId: string, message: string) => {
    if (pocketBusyRef.current.has(petId)) return;
    pocketBusyRef.current.add(petId);
    setStatus(petId, "working");
    const thread = pocketThreadsRef.current[petId] ?? [];
    const labels = { phone: tRef.current.companion.fromPhone };
    const history = companionHistoryFor(thread, "pc", labels);
    try {
      const out = await streamAgentTurn(
        {
          petId,
          locale: localeRef.current,
          sessionId: sessionsRef.current[petId],
          message,
          history: thread
            .filter((line) => line.from === "phone" || line.from === "pet")
            .slice(-24)
            .map((line) => ({
              role:
                line.from === "phone" ? ("user" as const) : ("assistant" as const),
              content: line.text,
            })),
          grants: grantsFor(grantsMapRef.current, petId),
          config: configFor(configMapRef.current, petId),
        },
        (event, partial) => {
          if (partial.progress) setProgress(petId, partial.progress);
          if (partial.sessionId) sessionsRef.current[petId] = partial.sessionId;
          if (event.type === "artifact") {
            setArtifact(event);
            setCanvasOpen(false);
            keepArtifact(petId, event);
          }
          if (event.type === "text" && partial.text && !partial.approval) {
            pushTalkRef.current({
              petId,
              mode: "chat",
              channel: "pocket",
              text: partial.text,
              streaming: true,
              history,
            });
          }
        }
      );
      const reply = (out.error || out.approval?.text || out.text).trim();
      if (!reply) {
        setStatus(petId, "idle");
        return;
      }
      const posted = await postCompanionMessage({
        id: petId,
        text: reply,
        as: "pet",
      });
      if (!posted.ok) {
        setStatus(petId, posted.error === "asleep" ? "done" : "idle");
        return;
      }
      const prev = pocketThreadsRef.current[petId] ?? [];
      const next = prev.some((row) => row.msgId === posted.line.msgId)
        ? prev
        : [...prev, posted.line];
      pocketThreadsRef.current[petId] = next;
      seenPocketRef.current.add(posted.line.msgId);
      if (out.sessionId) sessionsRef.current[petId] = out.sessionId;
      if (out.artifact) {
        setArtifact(out.artifact);
        setCanvasOpen(false);
        keepArtifact(petId, out.artifact);
      }
      pushTalkRef.current({
        petId,
        mode: posted.asleep ? "alert" : "chat",
        channel: "pocket",
        text: posted.asleep ? tRef.current.companion.asleepHint : "",
        history: companionHistoryFor(next, "pc", labels),
      });
      setStatus(petId, posted.asleep ? "done" : "idle");
    } finally {
      pocketBusyRef.current.delete(petId);
    }
  };

  const openPocketTalk = (petId: string) => {
    const history = companionHistoryFor(
      pocketThreadsRef.current[petId] ?? [],
      "pc",
      { phone: tRef.current.companion.fromPhone }
    );
    setSelectedId(petId);
    pushTalkRef.current({
      petId,
      mode: "chat",
      channel: "pocket",
      text: "",
      history,
    });
    void window.petassist?.showSticky?.(petId);
    void window.petassist?.resizeSticky?.(petId, "chat");
  };

  const handlePocketMessage = (
    line: CompanionChatLine,
    thread: CompanionChatLine[],
    meta?: { leapTo?: "pc" | "phone" }
  ) => {
    pocketThreadsRef.current = {
      ...pocketThreadsRef.current,
      [line.petId]: thread,
    };
    const history = companionHistoryFor(thread, "pc", {
      phone: tRef.current.companion.fromPhone,
    });
    const current = promptRef.current;
    const samePocket =
      current?.channel === "pocket" && current.petId === line.petId;
    if (seenPocketRef.current.has(line.msgId)) {
      if (samePocket) {
        pushTalkRef.current({
          petId: line.petId,
          mode: "chat",
          channel: "pocket",
          text: "",
          history,
        });
      }
      return;
    }
    seenPocketRef.current.add(line.msgId);
    if (line.from === "pc" || line.from === "pet") {
      if (samePocket) {
        pushTalkRef.current({
          petId: line.petId,
          mode: "chat",
          channel: "pocket",
          text: "",
          history,
        });
      }
      return;
    }
    void window.petassist?.notify?.({
      title: petName(line.petId),
      body: tRef.current.companion.notifyBody(line.text).slice(0, 180),
    });
    if (meta?.leapTo === "pc") {
      pendingPocketTalkRef.current.add(line.petId);
      if (promptRef.current?.petId === line.petId) {
        pushTalkRef.current(null);
      }
      void window.petassist?.resizeSticky?.(line.petId, "compact");
      void runPocketBot(line.petId, line.text);
      return;
    }
    openPocketTalk(line.petId);
    void runPocketBot(line.petId, line.text);
  };

  const handleCompanionLeap = (id: string, to: "pc" | "phone") => {
    if (to === "phone") {
      pendingPocketTalkRef.current.delete(id);
      if (promptRef.current?.petId === id) pushTalkRef.current(null);
      void window.petassist?.resizeSticky?.(id, "compact");
    }
  };

  const handleCompanionArrived = (
    id: string,
    location: import("@/lib/companion/protocol").CompanionLocation
  ) => {
    if (location !== "pc") return;
    if (!pendingPocketTalkRef.current.has(id)) return;
    pendingPocketTalkRef.current.delete(id);
    openPocketTalk(id);
  };

  const handlePetAsleep = (id: string) => {
    setStatus(id, "done");
    pushTalkRef.current({
      petId: id,
      mode: "alert",
      channel: "pocket",
      text: tRef.current.companion.asleepHint,
      history: companionHistoryFor(pocketThreadsRef.current[id] ?? [], "pc", {
        phone: tRef.current.companion.fromPhone,
      }),
    });
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.petassist) return;
    const MAIL_SEEN = "pockassist.mail.seen.v1";
    const loadSeen = () => {
      try {
        const raw = window.localStorage.getItem(MAIL_SEEN);
        const parsed = raw ? (JSON.parse(raw) as string[]) : [];
        return new Set(parsed);
      } catch {
        return new Set<string>();
      }
    };
    const seen = loadSeen();
    let seeded = seen.size > 0;
    let timer = 0;
    const tick = async () => {
      const mailPets = partyRef.current.filter((pet) => {
        const cfg = configFor(configMapRef.current, pet.id);
        return (
          cfg.apps.includes("mail") &&
          !cfg.hidden &&
          pet.status !== "stopped" &&
          pet.status !== "empty"
        );
      });
      if (!mailPets.length) return;
      try {
        const res = await fetch("/api/agent/mail/unread?locale=" + localeRef.current, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          messages?: Array<{
            id: string;
            subject: string;
            sender: string;
            snippet?: string;
          }>;
        };
        const messages = json.messages ?? [];
        if (!seeded) {
          for (const msg of messages) seen.add(msg.id);
          window.localStorage.setItem(MAIL_SEEN, JSON.stringify([...seen]));
          seeded = true;
          return;
        }
        const fresh = messages.filter((msg) => !seen.has(msg.id));
        if (!fresh.length) return;
        for (const msg of fresh) seen.add(msg.id);
        window.localStorage.setItem(MAIL_SEEN, JSON.stringify([...seen]));
        const pet = mailPets[0]!;
        const first = fresh[0]!;
        void window.petassist?.notify?.({
          title: petName(pet.id),
          body:
            localeRef.current === "ja"
              ? `メール来たよ: ${first.subject}`
              : `New mail: ${first.subject}`,
        });
        void window.petassist?.showSticky?.(pet.id);
        void window.petassist?.resizeSticky?.(pet.id, "alert");
        const lines = fresh
          .map(
            (msg) =>
              `${msg.sender}\n${msg.subject}\n${(msg.snippet ?? "").slice(0, 180)}`
          )
          .join("\n---\n");
        const prompt =
          localeRef.current === "ja"
            ? `新着メールだよ。まだ送らないで。返信文面を書いて mail_draft し、mail_send で送信ボタンまで待ってね。\n\n${lines}`
            : `New mail arrived. Do not send yet. Draft a reply with mail_draft, then mail_send and wait for the send button.\n\n${lines}`;
        await runPetRef.current(pet.id, { message: prompt });
      } catch {
        /* Mail.app missing or denied */
      }
    };
    void tick();
    timer = window.setInterval(() => void tick(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return subscribeDesk((event) => {
      if (event.type === "hello") {
        publishDeskSnapshot(
          partyRef.current.map((p) => ({
            id: p.id,
            status: p.status,
            progress: p.progress,
            icon: p.icon,
            accent: p.accent,
          })),
          promptRef.current
        );
        return;
      }
      if (event.type === "config") {
        setConfigMap((prev) => {
          const map = { ...prev, [event.id]: parsePetConfig(event.config) };
          saveConfigs(map);
          return map;
        });
        return;
      }
      if (event.type === "grants") {
        setGrantsMap((prev) => {
          const map = { ...prev, [event.id]: event.grants };
          saveGrants(map);
          return map;
        });
        return;
      }
      if (event.type === "talk-open") {
        const pending = pendingDispatchRef.current;
        const current = promptRef.current;
        if (pending && isDeskTalk(current?.petId) && current?.mode === "choice") {
          if (pending.petId === event.petId) {
            setSelectedId(event.petId);
            return;
          }
          pendingDispatchRef.current = null;
          setStatus(pending.petId, pending.prevStatus);
        }
        if (current?.petId === event.petId && current.mode === "choice") return;
        if (current?.channel === "pocket" && current.petId === event.petId) {
          setSelectedId(event.petId);
          pushTalkRef.current({
            petId: event.petId,
            mode: "chat",
            channel: "pocket",
            text: "",
            history: companionHistoryFor(
              pocketThreadsRef.current[event.petId] ?? [],
              "pc",
              { phone: tRef.current.companion.fromPhone }
            ),
          });
          return;
        }
        const pet = partyRef.current.find((p) => p.id === event.petId);
        if (!pet) return;
        setSelectedId(event.petId);
        const keepAlert =
          current?.petId === event.petId && current.mode === "alert";
        const history = chatsRef.current[event.petId] ?? [];
        pushTalkRef.current({
          petId: event.petId,
          mode: keepAlert ? "alert" : "chat",
          text: keepAlert
            ? current.text
            : history.length
              ? ""
              : tRef.current.talk.ask,
          detail: keepAlert ? current.detail : undefined,
        });
        return;
      }
      if (event.type === "talk-reply") {
        handleReplyRef.current(
          event.petId,
          event.kind,
          event.choiceId,
          event.text
        );
        return;
      }
      if (event.type === "talk-new") {
        startNewChatRef.current(event.petId);
        return;
      }
      if (event.type === "talk-switch") {
        switchChatRoomRef.current(event.petId, event.roomId);
        return;
      }
      if (event.type === "talk-preview") {
        const petId = event.petId || selectedIdRef.current;
        if (!petId) return;
        appendThreadArtifact(petId, event.artifact);
        const current = promptRef.current;
        if (current?.petId === petId) {
          pushTalkRef.current({
            petId,
            mode: current.mode,
            text: current.text,
            detail: current.detail,
            channel: current.channel,
          });
        }
      }
    });
  }, []);

  const selected = useMemo(
    () => party.find((p) => p.id === selectedId) ?? null,
    [party, selectedId]
  );

  const onStatusClick = (id: string, status: PartyStatus) => {
    const current = partyRef.current.find((p) => p.id === id);
    const activating =
      (status === "idle" || status === "working") &&
      current &&
      !isActiveStatus(current.status);
    const active = partyRef.current.filter((p) => isActiveStatus(p.status)).length;
    if (activating && active >= ACTIVE_SOFT_LIMIT) {
      setBusy({
        body: tRef.current.busy.activate,
        run: () => {
          setStatus(id, status);
          if (status === "idle") pushTalk(null);
        },
      });
      return;
    }
    setStatus(id, status);
    if (status === "idle" || status === "stopped") pushTalk(null);
  };

  const reorderParty = (fromId: string, toId: string) => {
    const next = moveInOrder(
      partyRef.current.map((p) => p.id),
      fromId,
      toId
    );
    savePartyOrder(next);
    setParty((prev) => applyPartyOrder(prev, next));
  };

  const harnessLabel =
    harness == null
      ? t.harness.checking
      : harness.runtime === "trueforge"
        ? t.harness.trueforge
        : harness.runtime === "openai"
          ? t.harness.openai
          : t.harness.offline;

  const threadId = prompt?.petId ?? selectedId ?? DESK_ID;
  const rawThread = chats[threadId] ?? [];
  const thread =
    !prompt &&
    isDeskTalk(threadId) &&
    rawThread.every((line) => line.role === "system")
      ? []
      : rawThread;
  const deskPrompt: TalkPrompt = {
    ...(prompt ??
      ({
        petId: threadId,
        mode: "chat",
        text: thread.length
          ? ""
          : selectedId
            ? t.talk.ask
            : t.talk.dispatchAsk,
      } satisfies TalkPrompt)),
    history:
      prompt?.channel === "pocket"
        ? (prompt.history ??
          companionHistoryFor(
            pocketThreadsRef.current[prompt.petId] ?? [],
            "pc",
            { phone: t.companion.fromPhone }
          ))
        : thread,
    ...(prompt?.channel === "pocket" || isDeskTalk(threadId)
      ? {}
      : {
          roomId: activeThreadId(threadId),
          rooms: listThreads(threadId),
          artifacts: loadArtifacts(threadId),
        }),
  };
  const deskTalk = isDeskTalk(deskPrompt.petId);
  const panelName = deskTalk
    ? prompt?.mode === "choice" && selectedId
      ? petName(selectedId)
      : t.talk.desk
    : petName(deskPrompt.petId);

  return (
    <CompanionProvider
      party={party}
      onPocketMessage={handlePocketMessage}
      onPetAsleep={handlePetAsleep}
      onLeap={handleCompanionLeap}
      onArrived={handleCompanionArrived}
    >
    <div
      className={cn(
        "mx-auto flex flex-col gap-4 px-4",
        artifact && canvasOpen ? "max-w-6xl" : "max-w-3xl",
        embedded ? "py-4" : "min-h-screen py-6"
      )}
    >
      <PairSheet />
      <header className="relative z-40 flex items-center gap-2 rounded-2xl bg-white/90 px-3 py-3 shadow-sm backdrop-blur">
        <DockMenu />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-[hsl(var(--primary))]">
            {t.brand.kicker}
          </p>
          <h1 className="text-lg font-bold text-[#302c55]">{t.brand.title}</h1>
        </div>
        <Badge
          data-testid="harness-badge"
          variant={harness?.runtime ? "secondary" : "outline"}
        >
          {harnessLabel}
        </Badge>
      </header>

      <section className="rounded-2xl bg-white/90 p-4 shadow-sm backdrop-blur">
        <div
          className={cn(
            artifact && canvasOpen && "flex flex-col gap-3 md:flex-row md:items-start"
          )}
        >
          <div className="min-w-0 flex-1">
            <TalkPanel
              className="w-full max-w-none shadow-none"
              prompt={deskPrompt}
              name={panelName}
              onDesk={
                deskTalk
                  ? undefined
                  : () => {
                      setSelectedId(null);
                      pushTalk(null);
                    }
              }
              onChoice={(choiceId) =>
                handleReply(deskPrompt.petId, "choice", choiceId)
              }
              onSend={(text) =>
                handleReply(deskPrompt.petId, "message", undefined, text)
              }
              onDraw={
                deskPrompt.channel === "pocket"
                  ? undefined
                  : (text) =>
                      handleReply(deskPrompt.petId, "draw", undefined, text)
              }
              onNewChat={
                deskPrompt.channel === "pocket" || isDeskTalk(deskPrompt.petId)
                  ? undefined
                  : () => startNewChat(deskPrompt.petId)
              }
              onSwitchChat={
                deskPrompt.channel === "pocket" || isDeskTalk(deskPrompt.petId)
                  ? undefined
                  : (roomId) => switchChatRoom(deskPrompt.petId, roomId)
              }
              onOpenArtifact={(artifact) =>
                openPreview(artifact, deskPrompt.petId)
              }
              drawing={Boolean(drawingId)}
            />
          </div>
          {artifact && canvasOpen ? (
            <ArtifactCanvas
              artifact={artifact}
              grants={grantsFor(
                grantsMap,
                isDeskTalk(deskPrompt.petId)
                  ? selectedId ?? "ghost"
                  : deskPrompt.petId
              )}
              onClose={() => setCanvasOpen(false)}
            />
          ) : null}
        </div>
        {!embedded ? (
          <div className="mt-3 max-h-48 space-y-1 overflow-auto rounded-xl bg-[#f7f8fb] p-3 font-mono text-xs text-[#302c55]">
            {logs.map((l, i) => (
              <p key={`${l.t}-${i}`}>
                <span className="text-slate-400">{l.t}</span> {l.text}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {!embedded && selected && (
        <section className="rounded-2xl bg-white/90 p-4 shadow-sm backdrop-blur">
          <p className="mb-2 text-sm">
            <Badge>{t.status[selected.status]}</Badge>
          </p>
          <CapabilityList
            className="mb-3 rounded-xl bg-[#f7f8fb] p-3"
            petId={selected.id}
            grants={grantsFor(grantsMap, selected.id)}
            config={configFor(configMap, selected.id)}
          />
          <div className="mb-2 flex flex-wrap gap-1">
            <Button
              size="sm"
              variant={selected.status === "idle" ? "default" : "outline"}
              onClick={() => onStatusClick(selected.id, "idle")}
            >
              {t.selected.live}
            </Button>
            <Button
              size="sm"
              variant={selected.status === "stopped" ? "default" : "outline"}
              onClick={() => onStatusClick(selected.id, "stopped")}
            >
              {t.selected.stop}
            </Button>
          </div>
          <GrantPicker
            grants={grantsFor(grantsMap, selected.id)}
            deskAvailable={desk.available}
            onChange={(next) => setPetGrants(selected.id, next)}
          />
        </section>
      )}

      <div className="sticky bottom-3 z-30 mt-auto overflow-visible">
        <DeskPartyBar
          party={party}
          selectedId={selectedId}
          pinnedIds={desk.pinned}
          hiddenIds={desk.hidden}
          tearOff={desk.available}
          talkingId={prompt?.petId ?? null}
          onSelect={(id) => setSelectedId(id)}
          onChat={(id) => {
            setSelectedId(id);
            const current = promptRef.current;
            if (current?.mode === "choice") return;
            if (current?.channel === "pocket" && current.petId === id) {
              pushTalk({
                petId: id,
                mode: "chat",
                channel: "pocket",
                text: "",
                history: companionHistoryFor(
                  pocketThreadsRef.current[id] ?? [],
                  "pc",
                  { phone: t.companion.fromPhone }
                ),
              });
              return;
            }
            publishDeskTalkOpen(id);
          }}
          onReorder={reorderParty}
          onMenuOpen={(id) => {
            const current = promptRef.current;
            if (current?.petId === id && current.mode === "choice") return false;
            if (current?.petId === id) pushTalk(null);
          }}
        />
      </div>

      <AlertDialog open={Boolean(busy)} onOpenChange={(open) => !open && setBusy(null)}>
        <AlertDialogContent className="max-w-sm p-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{t.busy.title}</AlertDialogTitle>
            <AlertDialogDescription>{busy?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.busy.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                busy?.run();
                setBusy(null);
              }}
            >
              {t.busy.continue}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </CompanionProvider>
  );
}

function DeskPartyBar(
  props: Omit<ComponentProps<typeof PartyBar>, "awayIds">
) {
  const companion = useCompanion();
  const awayIds = Object.entries(companion?.locations ?? {})
    .filter(([, loc]) => loc === "phone" || loc === "transit")
    .map(([id]) => id);
  return <PartyBar {...props} awayIds={awayIds} />;
}
