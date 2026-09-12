import path from "node:path";
import { instructionsFor, isLiveAgentId, trueForgeAgentSpec } from "./specs";
import { MESSAGES } from "@/lib/i18n/messages";
import { isLocale, type Locale } from "@/lib/i18n/types";
import { needsLocalRuntime, parseGrants } from "@/lib/grants";
import { parsePetConfig, usesLlmGateway } from "@/lib/pet-config";
import { isDeskTool } from "./sandbox";
import { absolutePathsIn, clutterGrantIn, wellKnownFoldersIn, withMessageFolders } from "./desk-paths";
import {
  fileNamesIn,
  findNamedFiles,
  isDeskFileJob,
  nameChoices,
  organizeNamedFiles,
  tidyDirectory,
  wantsFolder,
  wantsTidy,
  wantsZip,
} from "./desk-organize";
import { classifyTask, needsDisk, parseAllowSpeech, rerouteDirectTalk, wantsMacApp } from "@/lib/dispatch";
import { listMcpCatalog } from "./mcp";
import {
  createTrueForgeSession,
  pickTrueForgeModel,
  probeTrueForge,
  runTrueForgeTurn,
} from "./trueforge";
import { routeForModel, explainLlmError, probeGemini } from "./gateway";
import { probeOpenAi, runOpenAiTurn, resumeOpenAiApproval } from "./openai";
import { availableImageModels } from "./images";
import { isSendTool } from "./types";
import { getSession, newSessionId, putSession, resetPetSessions } from "./store";
import type {
  AgentRuntime,
  AgentSession,
  AgentStreamEvent,
  OpenAiMessage,
  PendingAction,
} from "./types";

export type TurnRequest = {
  petId: string;
  locale: Locale;
  sessionId?: string;
  message?: string;
  approval?: "allow" | "deny";
  choiceId?: string;
  grants?: unknown;
  config?: unknown;
  requireHarness?: boolean;
  history?: { role: "user" | "assistant"; content: string }[];
};

type Emit = (event: AgentStreamEvent) => void;

function priorChat(
  history: TurnRequest["history"],
  message: string
): { role: "user" | "assistant"; content: string }[] {
  const lines: { role: "user" | "assistant"; content: string }[] = [];
  for (const line of history ?? []) {
    if (line.role !== "user" && line.role !== "assistant") continue;
    const content = line.content.trim();
    if (!content) continue;
    lines.push({ role: line.role, content });
  }
  const last = lines[lines.length - 1];
  if (last?.role === "user" && last.content === message) lines.pop();
  return lines.slice(-24);
}

function withChatRecap(
  message: string,
  history: TurnRequest["history"],
  locale: Locale
): string {
  const prior = priorChat(history, message);
  if (!prior.length) return message;
  const you = locale === "ja" ? "あなた" : "You";
  const me = locale === "ja" ? "わたし" : "Me";
  const body = prior
    .map((line) => `${line.role === "user" ? you : me}: ${line.content}`)
    .join("\n");
  return locale === "ja"
    ? `これまでの会話:\n${body}\n\nいまの指示:\n${message}`
    : `Earlier chat:\n${body}\n\nNow:\n${message}`;
}

type HarnessSnapshot = {
  runtime: AgentRuntime | null;
  trueforge: Awaited<ReturnType<typeof probeTrueForge>>;
  openai: ReturnType<typeof probeOpenAi>;
  gemini: ReturnType<typeof probeGemini>;
  mcp: Awaited<ReturnType<typeof listMcpCatalog>>;
  imageModels: ReturnType<typeof availableImageModels>;
};

let harnessCache: { at: number; value: HarnessSnapshot } | null = null;

export async function harnessStatus(): Promise<HarnessSnapshot> {
  const now = Date.now();
  const ttl = harnessCache?.value.runtime ? 30_000 : 4_000;
  if (harnessCache && now - harnessCache.at < ttl) {
    return harnessCache.value;
  }
  const tf = await probeTrueForge();
  const oa = probeOpenAi();
  const gemini = probeGemini();
  const mcp = tf.ok
    ? await listMcpCatalog()
    : { names: [], search: null, write: null };
  const runtime: AgentRuntime | null = tf.ok
    ? "trueforge"
    : oa.ok
      ? "openai"
      : gemini.ok
        ? "openai"
        : null;
  const value: HarnessSnapshot = {
    runtime,
    trueforge: tf,
    openai: oa,
    gemini,
    mcp,
    imageModels: availableImageModels(),
  };
  harnessCache = { at: now, value };
  return value;
}

export async function runAgentTurn(req: TurnRequest, emit: Emit) {
  if (!isLiveAgentId(req.petId)) {
    emit({ type: "error", message: MESSAGES[req.locale].errors.unknownPet });
    return;
  }
  const locale = isLocale(req.locale) ? req.locale : "ja";
  const parsedGrants = parseGrants(req.grants);
  const config = parsePetConfig(req.config);
  const session = req.sessionId ? getSession(req.sessionId) : undefined;
  if (session) {
    session.grants = parsedGrants;
    session.config = config;
  }
  emit({ type: "progress", progress: 6 });
  const status = await harnessStatus();

  if (session?.pending?.toolName === "desk_organize" && session.deskPending) {
    const dest = (req.choiceId ?? req.message ?? "").trim();
    if (!dest) {
      emit({
        type: "error",
        message: locale === "ja" ? "名前を選んでね" : "Pick a name",
      });
      return;
    }
    const runtime: AgentRuntime = session.runtime ?? "openai";
    emit({ type: "meta", sessionId: session.id, runtime });
    emit({ type: "progress", progress: 50 });
    const result = await organizeNamedFiles({
      names: session.deskPending.names,
      extraPaths: session.deskPending.extraPaths,
      found: session.deskPending.found,
      message: dest,
      grants: parsedGrants,
      locale,
      intent: session.deskPending.intent,
      destName: dest,
    });
    session.pending = undefined;
    session.deskPending = undefined;
    session.grants = result.grants;
    putSession(session);
    finishTurn(session, result.text, undefined, emit);
    return;
  }

  if (session?.pending && !req.approval && req.message?.trim()) {
    const yn = parseAllowSpeech(req.message);
    if (yn) req.approval = yn;
    else if (session.pending.openaiToolCall) {
      const held = session.pending.openaiToolCall;
      session.openaiMessages = [
        ...(session.openaiMessages ?? []),
        {
          role: "tool",
          tool_call_id: held.id,
          content: JSON.stringify({
            ok: false,
            skipped: true,
            reason: "trainer changed the job",
          }),
        },
      ];
      session.pending = undefined;
      putSession(session);
    }
  }

  if (req.approval && !session?.pending) {
    emit({
      type: "error",
      message:
        locale === "ja"
          ? "承認待ちの操作がありません"
          : "Nothing is waiting for approval",
    });
    return;
  }

  if (session?.pending && req.approval) {
    emit({ type: "meta", sessionId: session.id, runtime: session.runtime });
    emit({ type: "progress", progress: 36 });
    try {
      if (session.runtime === "trueforge" && session.trueforgeSessionId) {
        const input = approvalInput(session, req.approval, locale);
        const held = session.pending;
        try {
          const result = await runTrueForgeTurn(
            session.trueforgeSessionId,
            input,
            (event) => {
              emit({ type: "progress", progress: event.progress });
              if (event.text) emit({ type: "text", text: event.text });
              if (event.harness) emit({ type: "harness", ...event.harness });
            }
          );
          session.pending = undefined;
          finishTurn(session, result.text, result.pending, emit, result.error);
          return;
        } catch (err) {
          session.pending = held;
          putSession(session);
          throw err;
        }
      }
      if (session.runtime === "openai") {
        const result = await resumeOpenAiApproval(
          session,
          req.approval,
          (progress, text) => {
            emit({ type: "progress", progress });
            if (text) emit({ type: "text", text });
          },
          (artifact) => emit({ type: "artifact", ...artifact })
        );
        session.openaiMessages = result.messages;
        session.pending = result.pending;
        putSession(session);
        finishTurn(session, result.text, result.pending, emit);
        return;
      }
    } catch (err) {
      emit({
        type: "error",
        message: explainLlmError(err, locale),
      });
    }
    return;
  }

  const message = req.message?.trim();
  if (!message) {
    emit({
      type: "error",
      message: locale === "ja" ? "指示が空です" : "Empty instruction",
    });
    return;
  }

  const handed = rerouteDirectTalk(req.petId, message, config);
  if (handed.handed && !req.requireHarness) {
    emit({ type: "handoff", from: req.petId, to: handed.petId });
    req.petId = handed.petId;
  }
  if (!isLiveAgentId(req.petId)) {
    emit({ type: "error", message: MESSAGES[locale].errors.unknownPet });
    return;
  }
  const petId = req.petId;

  const need = classifyTask(message);
  const grants = req.requireHarness
    ? parsedGrants
    : withMessageFolders(parsedGrants, message);

  if (
    !req.requireHarness &&
    (need === "zip" || wantsZip(message) || wantsFolder(message)) &&
    !wantsTidy(message)
  ) {
    const named = fileNamesIn(message);
    const extra = absolutePathsIn(message);
    const names = named.length ? named : (session?.pendingNames ?? []);
    const job =
      isDeskFileJob(message) ||
      extra.length > 0 ||
      (Boolean(session?.pendingNames?.length) &&
        (/権限|まとめて|フォルダ|zip|圧縮/i.test(message) || named.length > 0));
    if (job && (names.length > 0 || extra.length > 0)) {
      const runtime: AgentRuntime = "openai";
      const active: AgentSession = session ?? {
        id: newSessionId(),
        petId,
        locale,
        runtime,
      };
      active.locale = locale;
      active.runtime = runtime;
      if (wantsFolder(message)) active.deskIntent = "folder";
      else if (wantsZip(message)) active.deskIntent = "zip";
      else if (!active.deskIntent) active.deskIntent = "zip";
      if (named.length) active.pendingNames = named;
      else if (extra.length) {
        active.pendingNames = extra.map((p) => path.basename(p));
      }
      const intent = active.deskIntent ?? "zip";
      const useNames = names.length
        ? names
        : extra.map((p) => path.basename(p));
      const looked = extra.length
        ? { found: extra, missing: [] as string[] }
        : await findNamedFiles(useNames, grants);
      const found = [...new Set([...extra, ...looked.found])];
      if (!found.length) {
        active.config = config;
        active.grants = grants;
        putSession(active);
        emit({ type: "meta", sessionId: active.id, runtime });
        emit({ type: "grant", sessionId: active.id, reason: "folder" });
        finishTurn(
          active,
          locale === "ja"
            ? `デスクトップとダウンロードを見たけど、${useNames.join("、")} が見つからなかった。フォルダを選んでね。`
            : `Looked on Desktop and Downloads, but didn't find ${useNames.join(", ")}. Pick the folder.`,
          undefined,
          emit
        );
        return;
      }
      const question =
        intent === "folder"
          ? locale === "ja"
            ? "了解しました！新しいフォルダの名前は何にしますか？"
            : "Got it! What should we name the new folder?"
          : locale === "ja"
            ? "了解しました！圧縮したzipファイルの名前は何にしますか？"
            : "Got it! What should we name the zip file?";
      active.deskPending = {
        names: useNames,
        extraPaths: extra,
        found,
        intent,
      };
      active.config = config;
      active.grants = grants;
      active.pending = {
        kind: "ask_user",
        threadId: "desk",
        toolCallId: "name",
        toolName: "desk_organize",
        argsText: JSON.stringify({ question, names: useNames, intent }),
      };
      putSession(active);
      emit({ type: "meta", sessionId: active.id, runtime });
      emit({ type: "progress", progress: 50 });
      emit({
        type: "approval",
        sessionId: active.id,
        toolName: "desk_organize",
        detail: useNames.join(" "),
        text: question,
        choices: nameChoices(found, intent, locale),
      });
      return;
    }
  }

  const knownFolders = wellKnownFoldersIn(message);
  if (
    !req.requireHarness &&
    knownFolders.length > 0 &&
    wantsTidy(message) &&
    fileNamesIn(message).length === 0
  ) {
    const folder = knownFolders[0]!;
    const runtime: AgentRuntime = "openai";
    const active: AgentSession = session ?? {
      id: newSessionId(),
      petId,
      locale,
      runtime,
    };
    active.locale = locale;
    active.runtime = runtime;
    active.config = config;
    const workGrants = {
      sandbox:
        grants.sandbox === "full_access" ? ("full_access" as const) : ("workspace" as const),
      folders: [...new Set([...grants.folders, folder])],
    };
    emit({ type: "meta", sessionId: active.id, runtime });
    emit({ type: "progress", progress: 40 });
    try {
      const result = await tidyDirectory({
        folder,
        grants: workGrants,
        locale,
      });
      active.grants = result.grants;
      putSession(active);
      finishTurn(active, result.text, undefined, emit);
    } catch (err) {
      finishTurn(
        active,
        locale === "ja"
          ? `整理できなかったよ。${err instanceof Error ? err.message : ""}`
          : `Couldn't tidy that folder. ${err instanceof Error ? err.message : ""}`,
        undefined,
        emit
      );
    }
    return;
  }

  const thread = `${priorChat(req.history, message)
    .map((line) => line.content)
    .join("\n")}\n${message}`;
  const local =
    needsLocalRuntime(grants) ||
    (!req.requireHarness && (needsDisk(need) || wantsMacApp(thread)));
  const gateway = usesLlmGateway(config);
  if (req.requireHarness) {
    if (!status.trueforge.ok) {
      emit({ type: "error", message: MESSAGES[locale].errors.needsHarness });
      return;
    }
  } else if (gateway) {
    const routed = routeForModel(config.model);
    if (!("auto" in routed) && !routed.apiKey) {
      emit({
        type: "error",
        message:
          routed.provider === "gemini"
            ? locale === "ja"
              ? "GEMINI_API_KEY がありません"
              : "GEMINI_API_KEY missing"
            : MESSAGES[locale].errors.needsLocal,
      });
      return;
    }
  } else if (local && !status.openai.ok && !status.gemini.ok) {
    emit({ type: "error", message: MESSAGES[locale].errors.needsLocal });
    return;
  }

  let runtime: AgentRuntime | null = session?.runtime ?? status.runtime;
  if (req.requireHarness) runtime = "trueforge";
  else if (local || gateway) runtime = "openai";
  if (runtime !== "trueforge" && runtime !== "openai") {
    emit({ type: "error", message: MESSAGES[locale].errors.noRuntime });
    return;
  }

  const active: AgentSession = session ?? {
    id: newSessionId(),
    petId: req.petId,
    locale,
    runtime,
  };
  active.locale = locale;
  active.runtime = runtime;
  active.grants = grants;
  active.config = config;
  putSession(active);
  emit({ type: "meta", sessionId: active.id, runtime });
  emit({ type: "progress", progress: 10 });

  try {
    if (runtime === "trueforge") {
      const freshTf = !active.trueforgeSessionId;
      if (!active.trueforgeSessionId) {
        const model = status.trueforge.model ?? (await pickTrueForgeModel());
        if (!model) throw new Error("TrueForge has no chat model");
        const mcp = status.mcp ?? (await listMcpCatalog());
        if (mcp.search) {
          emit({ type: "harness", kind: "mcp", detail: mcp.search });
        }
        if (mcp.write) {
          emit({ type: "harness", kind: "mcp", detail: mcp.write });
        }
        active.trueforgeSessionId = await createTrueForgeSession(
          trueForgeAgentSpec({
            petId,
            model,
            locale,
            grants,
            config,
            mcp,
          })
        );
        putSession(active);
        emit({ type: "progress", progress: 22 });
      }
      const result = await runTrueForgeTurn(
        active.trueforgeSessionId,
        [
          {
            type: "user.message",
            content: freshTf
              ? withChatRecap(message, req.history, locale)
              : message,
          },
        ],
        (event) => {
          emit({ type: "progress", progress: event.progress });
          if (event.text) emit({ type: "text", text: event.text });
          if (event.harness) emit({ type: "harness", ...event.harness });
        }
      );
      finishTurn(active, result.text, result.pending, emit, result.error);
      return;
    }

    const system: OpenAiMessage = {
      role: "system",
      content: instructionsFor(petId, locale, grants, "openai", config),
    };
    const history = active.openaiMessages?.length
      ? active.openaiMessages
      : [
          system,
          ...priorChat(req.history, message).map((line) => ({
            role: line.role,
            content: line.content,
          })),
        ];
    if (history[0]?.role === "system") history[0] = system;
    else history.unshift(system);
    history.push({ role: "user", content: message });
    const result = await runOpenAiTurn({
      petId,
      locale,
      messages: history,
      grants,
      config,
      onProgress: (progress, text) => {
        emit({ type: "progress", progress });
        if (text) emit({ type: "text", text });
      },
      onArtifact: (artifact) => emit({ type: "artifact", ...artifact }),
    });
    active.openaiMessages = result.messages;
    active.pending = result.pending;
    putSession(active);
    finishTurn(active, result.text, result.pending, emit);
  } catch (err) {
    emit({
      type: "error",
      message: explainLlmError(err, locale),
    });
  }
}

function approvalInput(
  session: AgentSession,
  approval: "allow" | "deny",
  locale: Locale
) {
  const pending = session.pending!;
  if (pending.kind === "ask_user") {
    return [
      {
        type: "user.tool_response",
        thread_id: pending.threadId,
        tool_call_id: pending.toolCallId,
        content:
          approval === "allow"
            ? locale === "ja"
              ? "みとめる"
              : "Allow"
            : locale === "ja"
              ? "やめる"
              : "Deny",
      },
    ];
  }
  return [
    {
      type: "user.tool_approval",
      thread_id: pending.threadId,
      tool_call_id: pending.toolCallId,
      approval:
        approval === "allow"
          ? { status: "allow" }
          : {
              status: "deny",
              reason: locale === "ja" ? "トレーナーが拒否" : "Trainer denied",
            },
    },
  ];
}

function finishTurn(
  session: AgentSession,
  text: string,
  pending: PendingAction | undefined,
  emit: Emit,
  error?: string
) {
  if (error) {
    emit({ type: "error", message: error });
    return;
  }
  session.pending = pending;
  putSession(session);
  const say = text || (session.locale === "ja" ? "わかった" : "Got it.");
  emit({ type: "text", text: say });
  emit({ type: "progress", progress: pending ? 88 : 100 });
  if (pending) {
    emit({
      type: "approval",
      sessionId: session.id,
      toolName: pending.toolName,
      detail: prettyArgs(pending.argsText),
      text: approvalLine(session, pending),
    });
    return;
  }
  emit({ type: "done", sessionId: session.id, text: say });
}

function prettyArgs(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const rec = parsed as Record<string, unknown>;
      if (typeof rec.text === "string") return rec.text;
      if (typeof rec.prompt === "string") return rec.prompt;
      if (typeof rec.title === "string") return rec.title;
      if (typeof rec.draft === "string") return rec.draft;
      if (typeof rec.question === "string") return rec.question;
      if (typeof rec.command === "string") {
        return rec.cwd ? `${rec.command}  (${rec.cwd})` : rec.command;
      }
      if (typeof rec.path === "string") return rec.path;
      if (typeof rec.dest === "string") return rec.dest;
      if (typeof rec.source === "string") return rec.source;
      if (typeof rec.from_folder === "string") return rec.from_folder;
      if (typeof rec.app === "string") return rec.app;
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    /* plain */
  }
  return raw;
}

function approvalLine(session: AgentSession, pending: PendingAction) {
  const ja = session.locale === "ja";
  if (isSendTool(pending.toolName) || /slack|post_message|chat\.post|send_message|mail_send/i.test(pending.toolName)) {
    return ja ? "そとにだしていい？" : "OK to send this outside?";
  }
  if (pending.toolName === "open_app") {
    return ja ? "このアプリを開いていい？" : "OK to open this app?";
  }
  if (isDeskTool(pending.toolName)) {
    return ja ? "フォルダの外に出ていい？" : "OK to leave the granted folder?";
  }
  return ja ? "みとめる？" : "Allow this?";
}

export function resetAgents(petId?: string) {
  resetPetSessions(petId);
}
