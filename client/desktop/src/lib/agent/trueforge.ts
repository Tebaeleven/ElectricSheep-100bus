import { asRecord, pick, textFromContent } from "./parse";
import type { HarnessKind, PendingAction } from "./types";

export type TrueForgeStatus = {
  ok: boolean;
  baseUrl: string;
  model: string | null;
  error?: string;
};

const DEFAULT_BASE = "http://127.0.0.1:8790";

export function trueforgeBaseUrl() {
  return (process.env.TRUEFORGE_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

function headers() {
  const out: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.TRUEFORGE_TOKEN;
  if (token) out.authorization = `Bearer ${token}`;
  return out;
}

async function tfFetch(path: string, init?: RequestInit) {
  return fetch(`${trueforgeBaseUrl()}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

export async function probeTrueForge(): Promise<TrueForgeStatus> {
  const baseUrl = trueforgeBaseUrl();
  try {
    const model = await pickTrueForgeModel();
    return { ok: Boolean(model), baseUrl, model, error: model ? undefined : "No chat model configured" };
  } catch (err) {
    return {
      ok: false,
      baseUrl,
      model: null,
      error: err instanceof Error ? err.message : "TrueForge unreachable",
    };
  }
}

export async function pickTrueForgeModel(): Promise<string | null> {
  if (process.env.TRUEFORGE_MODEL) return process.env.TRUEFORGE_MODEL;
  const res = await tfFetch("/api/v1/models");
  if (!res.ok) {
    throw new Error(`TrueForge models ${res.status}`);
  }
  const json = (await res.json()) as { data?: Array<{ name?: string }> };
  const name = json.data?.find((m) => m.name)?.name;
  return name ?? null;
}

export async function createTrueForgeSession(spec: Record<string, unknown>) {
  const res = await tfFetch("/api/v1/sessions", {
    method: "POST",
    body: JSON.stringify({ agent: { spec } }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = asRecord(json.error);
    const message =
      (err && typeof err.message === "string" && err.message) ||
      (typeof json.message === "string" && json.message) ||
      `TrueForge session ${res.status}`;
    throw new Error(message);
  }
  const data = asRecord(json.data) ?? asRecord(json.session) ?? json;
  const id = pick<string>(data, "id");
  if (!id) throw new Error("TrueForge session missing id");
  return id;
}

type TurnResult = {
  text: string;
  pending?: PendingAction;
  error?: string;
};

export type TrueForgeTurnEvent = {
  progress: number;
  text?: string;
  harness?: { kind: HarnessKind; detail?: string };
};

export async function runTrueForgeTurn(
  sessionId: string,
  input: Record<string, unknown>[],
  onEvent?: (event: TrueForgeTurnEvent) => void
): Promise<TurnResult> {
  const res = await tfFetch(`/api/v1/sessions/${sessionId}/turns`, {
    method: "POST",
    body: JSON.stringify({ input, stream: true }),
  });
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = asRecord(json.error);
    const message =
      (err && typeof err.message === "string" && err.message) ||
      `TrueForge turn ${res.status}`;
    throw new Error(message);
  }

  const events = new Map<string, Record<string, unknown>>();
  let text = "";
  let streamed = "";
  let progress = 12;
  let pending: PendingAction | undefined;
  let turnError: string | undefined;

  await readSse(res.body, (event) => {
    const type = typeof event.type === "string" ? event.type : "";
    const id = pick<string>(event, "id");
    if (type.endsWith(".delta") && id) {
      const base =
        events.get(id) ??
        ({
          ...event,
          type: type.replace(/\.delta$/, ""),
          content: "",
        } as Record<string, unknown>);
      mergeDelta(base, event);
      events.set(id, base);
    } else if (id) {
      events.set(id, event);
    }

    if (type === "model.message.delta") {
      const extra = textFromContent(event.content);
      if (extra) {
        streamed += extra;
        text = streamed;
      }
      progress = Math.min(92, progress + 4);
      onEvent?.({ progress, text });
    } else if (type === "model.message") {
      const idKey = id ?? pick<string>(event, "id");
      const msg = (idKey && events.get(idKey)) || event;
      const next = textFromContent(msg.content);
      if (next && next.length >= text.length) text = next;
      progress = Math.min(92, progress + 4);
      onEvent?.({ progress, text });
    }

    const harness = harnessFromEvent(type, event);
    if (harness) {
      progress = Math.min(88, progress + 8);
      onEvent?.({ progress, text, harness });
    } else if (type === "tool.response") {
      progress = Math.min(88, progress + 8);
      onEvent?.({ progress, text });
    }

    if (type === "tool.approval_required" || type === "tool.response_required") {
      pending = pendingFromEvent(type, event, events);
    }

    if (type === "turn.done") {
      const state = asRecord(event.state);
      const status = pick<string>(state, "status");
      if (status === "error") {
        turnError =
          pick<string>(state, "message") ??
          pick<string>(asRecord(state?.error), "message") ??
          "TrueForge turn error";
      }
      const output = asRecord(state?.output);
      const outText = textFromContent(output?.content);
      if (outText) text = outText;
      const actions = state?.required_actions;
      if (Array.isArray(actions) && actions.length && !pending) {
        const first = asRecord(actions[0]);
        if (first) {
          pending = pendingFromEvent(
            typeof first.type === "string" ? first.type : "tool.approval_required",
            first,
            events
          );
        }
      }
    }
  });

  return { text: text.trim(), pending, error: turnError };
}

function harnessFromEvent(
  type: string,
  event: Record<string, unknown>
): { kind: HarnessKind; detail?: string } | undefined {
  if (type === "sandbox.created") {
    return { kind: "sandbox", detail: pick<string>(event, "provider", "id") };
  }
  if (type === "thread.created") {
    const thread = pick<string>(event, "thread_id", "threadId");
    if (thread && thread !== "main") {
      return { kind: "subagent", detail: thread };
    }
  }
  if (type === "mcp.initialize") {
    return {
      kind: "mcp",
      detail:
        pick<string>(event, "name", "server", "server_name") ??
        pick<string>(asRecord(event.mcp) ?? asRecord(event.server), "name"),
    };
  }
  if (type === "mcp.auth_required") {
    return {
      kind: "oauth",
      detail: pick<string>(event, "name", "server", "server_name"),
    };
  }
  return undefined;
}

function pendingFromEvent(
  type: string,
  event: Record<string, unknown>,
  events: Map<string, Record<string, unknown>>
): PendingAction | undefined {
  const threadId = pick<string>(event, "thread_id", "threadId") ?? "main";
  const calls = event.tool_calls ?? event.toolCalls;
  const list = Array.isArray(calls) ? calls : [];
  const ref = asRecord(list[0]);
  if (!ref) return undefined;
  const toolCallId = pick<string>(ref, "id") ?? "";
  const sourceId = pick<string>(ref, "source_event_id", "sourceEventId");
  const msg = sourceId ? events.get(sourceId) : undefined;
  const toolCalls = msg?.tool_calls ?? msg?.toolCalls;
  const callList = Array.isArray(toolCalls) ? toolCalls : [];
  const call =
    callList
      .map(asRecord)
      .find((c) => c && pick<string>(c, "id") === toolCallId) ?? asRecord(callList[0]);
  const fn = asRecord(call?.function) ?? asRecord(call?.toolInfo) ?? {};
  const name =
    pick<string>(fn, "name") ??
    pick<string>(asRecord(call?.tool_info) ?? asRecord(call?.toolInfo), "name") ??
    (type === "tool.response_required" ? "ask_user_question" : "tool");
  const args =
    pick<string>(fn, "arguments") ??
    (typeof fn.arguments === "object" ? JSON.stringify(fn.arguments) : "") ??
    "";
  return {
    kind: type === "tool.response_required" ? "ask_user" : "tool_approval",
    threadId,
    toolCallId,
    toolName: name,
    argsText: typeof args === "string" ? args : JSON.stringify(args ?? {}),
  };
}

function mergeDelta(base: Record<string, unknown>, delta: Record<string, unknown>) {
  const extra = textFromContent(delta.content);
  if (extra) {
    const prev = textFromContent(base.content);
    base.content = `${prev}${extra}`;
  }
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const chunks = buf.split(/\n\n/);
    buf = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const dataLines = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());
      if (!dataLines.length) continue;
      const raw = dataLines.join("");
      if (!raw || raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw) as unknown;
        const rec = asRecord(parsed);
        if (rec) onEvent(rec);
      } catch {
        /* skip malformed */
      }
    }
    if (done) break;
  }
}
