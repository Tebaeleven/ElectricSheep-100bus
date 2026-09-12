import { executeTool, isGatedTool, toolsFor } from "./tools";
import type { LiveAgentId } from "./specs";
import type { Locale } from "@/lib/i18n/types";
import { DEFAULT_GRANTS, type PetGrants } from "@/lib/grants";
import {
  DEFAULT_PET_CONFIG,
  type PetConfig,
} from "@/lib/pet-config";
import { openaiEnv, routeForModel, explainLlmError } from "./gateway";
import { classifyTask, isVagueBuildAsk, wantsTwitter } from "@/lib/dispatch";
import type {
  AgentSession,
  DeskArtifact,
  OpenAiMessage,
  OpenAiToolCall,
  PendingAction,
} from "./types";

export type OpenAiStatus = {
  ok: boolean;
  model: string | null;
  error?: string;
};

export function openaiConfig() {
  return openaiEnv();
}

export function probeOpenAi(): OpenAiStatus {
  const { apiKey, model } = openaiEnv();
  if (!apiKey) return { ok: false, model: null, error: "OPENAI_API_KEY missing" };
  return { ok: true, model };
}

type ChatResult = {
  text: string;
  messages: OpenAiMessage[];
  pending?: PendingAction;
};

export async function runOpenAiTurn(opts: {
  petId: LiveAgentId;
  locale: Locale;
  messages: OpenAiMessage[];
  grants?: PetGrants;
  config?: PetConfig;
  onProgress?: (progress: number, text: string) => void;
  onArtifact?: (artifact: DeskArtifact) => void;
}): Promise<ChatResult> {
  const grants = opts.grants ?? DEFAULT_GRANTS;
  const config = opts.config ?? DEFAULT_PET_CONFIG;
  const routed = routeForModel(config.model);
  const fallback = openaiEnv();
  const apiKey = "auto" in routed ? fallback.apiKey : routed.apiKey;
  const baseUrl = "auto" in routed ? fallback.baseUrl : routed.baseUrl;
  const model = "auto" in routed ? fallback.model : routed.model;
  if (!apiKey) {
    throw new Error(
      "auto" in routed || routed.provider === "openai"
        ? "OPENAI_API_KEY missing"
        : "GEMINI_API_KEY missing"
    );
  }
  const tools = toolsFor(opts.petId, grants, config);
  const messages = [...opts.messages];
  let progress = 18;
  let text = "";
  const lastUser = [...messages].reverse().find((msg) => msg.role === "user");
  const thread = messages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => msg.content)
    .join("\n");
  const lastIsUser = messages[messages.length - 1]?.role === "user";
  const forceZip =
    Boolean(lastUser?.content) &&
    classifyTask(lastUser?.content ?? "") === "zip" &&
    tools.some((tool) => tool.function.name === "zip_files");
  const forceWrite =
    Boolean(lastUser?.content) &&
    classifyTask(lastUser?.content ?? "") === "write" &&
    !isVagueBuildAsk(lastUser?.content ?? "") &&
    tools.some((tool) => tool.function.name === "write_file");
  const lastNeed = lastUser?.content
    ? classifyTask(lastUser.content)
    : "generic";
  const forceDraft =
    lastIsUser &&
    !/mail_draft|mail_send|新着メール|未読メール/i.test(lastUser?.content ?? "") &&
    (lastNeed === "draft" ||
      lastNeed === "send" ||
      /書|ツイート|告知|文案|おはよう/i.test(lastUser?.content ?? "")) &&
    tools.some((tool) => tool.function.name === "save_draft");
  const forceX =
    lastIsUser &&
    wantsTwitter(thread) &&
    tools.some((tool) => tool.function.name === "x_post");

  for (let i = 0; i < 24; i++) {
    progress = Math.min(90, progress + 10);
    opts.onProgress?.(progress, text);
    const body = {
      model,
      messages: messages.map(toApiMessage),
      tools,
      max_tokens: 8192,
      tool_choice:
        forceZip && i === 0
          ? { type: "function" as const, function: { name: "zip_files" } }
          : forceWrite && i === 0
            ? { type: "function" as const, function: { name: "write_file" } }
            : forceX && i === 0
            ? { type: "function" as const, function: { name: "x_post" } }
            : forceDraft && i === 0
              ? { type: "function" as const, function: { name: "save_draft" } }
              : ("auto" as const),
    };
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      if (i === 0) {
        await new Promise((ok) => setTimeout(ok, 400));
        continue;
      }
      throw new Error(explainLlmError(err, opts.locale));
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 280)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: OpenAiToolCall[];
        };
      }>;
    };
    const message = json.choices?.[0]?.message;
    if (!message) throw new Error("OpenAI returned no message");
    const assistant: OpenAiMessage = {
      role: "assistant",
      content: message.content ?? "",
      tool_calls: message.tool_calls,
    };
    messages.push(assistant);
    if (message.content) text = message.content;

    const calls = message.tool_calls ?? [];
    if (!calls.length) {
      return { text: (text || "").trim(), messages };
    }

    const gated = calls.filter((c) =>
      isGatedTool(c.function.name, c.function.arguments, grants, config)
    );
    const open = calls.filter(
      (c) => !isGatedTool(c.function.name, c.function.arguments, grants, config)
    );
    for (const call of open) {
      const result = await executeTool(
        call.function.name,
        call.function.arguments,
        opts.locale,
        grants,
        false,
        opts.petId,
        config
      );
      const artifact = artifactFromTool(result);
      if (artifact) opts.onArtifact?.(artifact);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
    const [firstGated, ...restGated] = gated;
    if (firstGated) {
      for (const extra of restGated) {
        messages.push({
          role: "tool",
          tool_call_id: extra.id,
          content: JSON.stringify({
            ok: false,
            skipped: true,
            reason:
              opts.locale === "ja"
                ? "先に別の Allow 待ちがあります"
                : "Queued behind another Allow",
          }),
        });
      }
      return {
        text: (text || askFor(opts.locale, firstGated.function.name)).trim(),
        messages,
        pending: {
          kind: "tool_approval",
          threadId: "openai",
          toolCallId: firstGated.id,
          toolName: firstGated.function.name,
          argsText: firstGated.function.arguments,
          openaiToolCall: {
            id: firstGated.id,
            name: firstGated.function.name,
            arguments: firstGated.function.arguments,
          },
        },
      };
    }
  }

  return { text: (text || "").trim(), messages };
}

export async function resumeOpenAiApproval(
  session: AgentSession,
  status: "allow" | "deny",
  onProgress?: (progress: number, text: string) => void,
  onArtifact?: (artifact: DeskArtifact) => void
): Promise<ChatResult> {
  const pending = session.pending;
  const messages = [...(session.openaiMessages ?? [])];
  if (!pending?.openaiToolCall) {
    throw new Error("No pending OpenAI tool call");
  }
  const locale = session.locale;
  const grants = session.grants ?? DEFAULT_GRANTS;
  const config = session.config ?? DEFAULT_PET_CONFIG;
  if (status === "deny") {
    messages.push({
      role: "tool",
      tool_call_id: pending.openaiToolCall.id,
      content: JSON.stringify({
        ok: false,
        delivered: false,
        denied: true,
        reason: locale === "ja" ? "トレーナーが拒否" : "Trainer denied",
      }),
    });
  } else {
    const result = await executeTool(
      pending.openaiToolCall.name,
      pending.openaiToolCall.arguments,
      locale,
      grants,
      true,
      session.petId as LiveAgentId,
      config
    );
    const artifact = artifactFromTool(result);
    if (artifact) onArtifact?.(artifact);
    messages.push({
      role: "tool",
      tool_call_id: pending.openaiToolCall.id,
      content: result,
    });
  }
  return runOpenAiTurn({
    petId: session.petId as LiveAgentId,
    locale,
    messages,
    grants,
    config,
    onProgress,
    onArtifact,
  });
}

function artifactFromTool(raw: string): DeskArtifact | undefined {
  try {
    const parsed = JSON.parse(raw) as {
      artifact?: {
        kind?: string;
        id?: string;
        title?: string;
        headers?: unknown;
        rows?: unknown;
      };
    };
    const art = parsed.artifact;
    if (!art) return undefined;
    if (art.kind === "image" && typeof art.id === "string") {
      return {
        kind: "image",
        id: art.id,
        title: typeof art.title === "string" ? art.title : undefined,
        url: `/api/agent/artifact?id=${encodeURIComponent(art.id)}`,
      };
    }
    if (
      art.kind === "sheet" &&
      typeof art.id === "string" &&
      art.id &&
      Array.isArray(art.headers)
    ) {
      const headers = art.headers.map((h) => String(h ?? ""));
      const rows = Array.isArray(art.rows)
        ? art.rows.map((row) =>
            Array.isArray(row) ? row.map((c) => String(c ?? "")) : []
          )
        : [];
      return {
        kind: "sheet",
        id: art.id,
        title: typeof art.title === "string" ? art.title : undefined,
        headers,
        rows,
      };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function toApiMessage(msg: OpenAiMessage) {
  if (msg.role === "tool") {
    return {
      role: "tool" as const,
      tool_call_id: msg.tool_call_id,
      content: msg.content,
    };
  }
  if (msg.role === "assistant" && msg.tool_calls?.length) {
    return {
      role: "assistant" as const,
      content: msg.content || null,
      tool_calls: msg.tool_calls,
    };
  }
  return { role: msg.role, content: msg.content };
}

function askFor(locale: Locale, toolName: string) {
  if (toolName === "slack_post" || toolName === "x_post" || toolName === "mail_send") {
    return locale === "ja" ? "そとにだしていい？" : "OK to send this outside?";
  }
  if (toolName === "open_app") {
    return locale === "ja" ? "このアプリを開いていい？" : "OK to open this app?";
  }
  return locale === "ja"
    ? "フォルダの外に出ていい？"
    : "OK to leave the granted folder?";
}
