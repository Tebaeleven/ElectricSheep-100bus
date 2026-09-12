import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { APP_CATALOG, type DeskAppId, type PetModelId } from "@/lib/pet-config";

const execFileAsync = promisify(execFile);

export type LlmStatus = {
  ok: boolean;
  model: string | null;
  error?: string;
};

export type LlmRoute = {
  provider: "openai" | "gemini";
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function openaiEnv() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  );
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return { apiKey, baseUrl, model };
}

export function geminiEnv() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  const baseUrl = (
    process.env.GEMINI_BASE_URL ??
    "https://generativelanguage.googleapis.com/v1beta/openai"
  ).replace(/\/$/, "");
  return { apiKey, baseUrl };
}

export function probeOpenAi(): LlmStatus {
  const { apiKey, model } = openaiEnv();
  if (!apiKey) return { ok: false, model: null, error: "OPENAI_API_KEY missing" };
  return { ok: true, model };
}

export function probeGemini(): LlmStatus {
  const { apiKey } = geminiEnv();
  if (!apiKey) return { ok: false, model: null, error: "GEMINI_API_KEY missing" };
  return { ok: true, model: "gemini-2.0-flash" };
}

export function explainLlmError(err: unknown, locale: "ja" | "en" = "ja"): string {
  const cause =
    err instanceof Error
      ? (err as Error & { cause?: { code?: string; message?: string } }).cause
      : undefined;
  const detail =
    (cause && (cause.code || cause.message)) ||
    (err instanceof Error ? err.message : "");
  const raw = String(detail || "");
  if (locale === "ja") {
    if (/abort|timeout/i.test(raw)) {
      return "モデルの応答が遅すぎたよ。もう一度送ってみて。";
    }
    if (/ENOTFOUND|EAI_AGAIN|dns/i.test(raw)) {
      return "モデルの場所が見つからなかったよ。ネットを確認して、もう一度送ってみて。";
    }
    if (/ECONNREFUSED|ECONNRESET|UND_ERR|fetch failed|Failed to fetch/i.test(raw)) {
      return "モデルに届かなかったよ。もう一度送ってみて。";
    }
    if (raw && raw !== "fetch failed" && raw !== "Failed to fetch") {
      return `モデルに届かなかったよ（${raw.slice(0, 80)}）。`;
    }
    return "モデルに届かなかったよ。もう一度送ってみて。";
  }
  if (/abort|timeout/i.test(raw)) return "The model timed out. Try sending again.";
  if (/ECONNREFUSED|ECONNRESET|UND_ERR|fetch failed|Failed to fetch|ENOTFOUND/i.test(raw)) {
    return "Couldn't reach the model. Try sending again.";
  }
  return raw && raw !== "fetch failed"
    ? `Couldn't reach the model (${raw.slice(0, 80)}).`
    : "Couldn't reach the model. Try sending again.";
}

export function routeForModel(id: PetModelId): LlmRoute | { auto: true } {
  if (id === "auto") return { auto: true };
  if (id.startsWith("gemini:")) {
    const { apiKey, baseUrl } = geminiEnv();
    return {
      provider: "gemini",
      apiKey,
      baseUrl,
      model: id.slice("gemini:".length),
    };
  }
  const openai = openaiEnv();
  return {
    provider: "openai",
    apiKey: openai.apiKey ?? "",
    baseUrl: openai.baseUrl,
    model: id.startsWith("openai:") ? id.slice("openai:".length) : openai.model,
  };
}

export async function openMacApp(appId: DeskAppId) {
  const row = APP_CATALOG.find((a) => a.id === appId);
  if (!row) throw new Error(`Unknown app ${appId}`);
  const bundles = appId === "x" ? ["X", "Twitter"] : [row.bundle];
  let last: unknown;
  for (const bundle of bundles) {
    try {
      await execFileAsync("open", ["-a", bundle], { timeout: 8000 });
      return { ok: true, app: bundle };
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("open failed");
}

export async function openXCompose(text: string) {
  const body = text.trim();
  const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(body)}`;
  for (const bundle of ["X", "Twitter"] as const) {
    try {
      await execFileAsync("open", ["-a", bundle, intent], { timeout: 8000 });
      return {
        ok: true,
        opened: true,
        posted: false,
        delivered: false,
        app: bundle,
        text: body,
      };
    } catch {
      /* try browser */
    }
  }
  await execFileAsync("open", [intent], { timeout: 8000 });
  return {
    ok: true,
    opened: true,
    posted: false,
    delivered: false,
    app: "browser",
    text: body,
  };
}
