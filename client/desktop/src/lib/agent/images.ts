import { geminiEnv, openaiEnv } from "./gateway";
import {
  IMAGE_MODEL_CATALOG,
  type PetConfig,
  type PetImageModelId,
} from "@/lib/pet-config";
import { putArtifact } from "./store";

export type ImageModelInfo = {
  id: PetImageModelId;
  provider: "auto" | "openai" | "gemini";
  label: string;
};

export function availableImageModels(): ImageModelInfo[] {
  const openai = Boolean(openaiEnv().apiKey);
  const gemini = Boolean(geminiEnv().apiKey);
  return IMAGE_MODEL_CATALOG.filter((row) => {
    if (row.id === "auto") return true;
    if (row.provider === "openai") return openai;
    if (row.provider === "gemini") return gemini;
    return false;
  });
}

export function resolveImageModel(
  config: PetConfig
): { provider: "openai" | "gemini"; model: string } | { error: string } {
  const openai = openaiEnv();
  const gemini = geminiEnv();
  const wanted = config.imageModel ?? "auto";
  if (wanted !== "auto") {
    if (wanted.startsWith("openai:")) {
      if (!openai.apiKey) return { error: "OPENAI_API_KEY missing" };
      return { provider: "openai", model: wanted.slice("openai:".length) };
    }
    if (wanted.startsWith("gemini:")) {
      if (!gemini.apiKey) return { error: "GEMINI_API_KEY missing" };
      return { provider: "gemini", model: wanted.slice("gemini:".length) };
    }
  }
  const chat = config.model ?? "auto";
  if (chat.startsWith("gemini:") && gemini.apiKey) {
    return { provider: "gemini", model: "imagen-3.0-generate-002" };
  }
  if (openai.apiKey) {
    return { provider: "openai", model: "gpt-image-1" };
  }
  if (gemini.apiKey) {
    return { provider: "gemini", model: "imagen-3.0-generate-002" };
  }
  return { error: "no image key" };
}

function sizeFor(model: string, size?: string) {
  const allowed =
    model === "dall-e-2"
      ? ["256x256", "512x512", "1024x1024"]
      : ["1024x1024", "1792x1024", "1024x1792"];
  if (size && allowed.includes(size)) return size;
  return "1024x1024";
}

async function openaiImage(model: string, prompt: string, size?: string) {
  const { apiKey, baseUrl } = openaiEnv();
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: sizeFor(model, size),
  };
  const res = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `image ${res.status}`);
  }
  const b64 = json.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  const url = json.data?.[0]?.url;
  if (!url) throw new Error("no image");
  const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!img.ok) throw new Error(`fetch image ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

async function openaiImageEdit(
  model: string,
  prompt: string,
  images: { mime: string; bytes: Buffer }[],
  mask?: { mime: string; bytes: Buffer }
) {
  const { apiKey, baseUrl } = openaiEnv();
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  images.forEach((img, i) => {
    const ext = img.mime.includes("png") ? "png" : "jpg";
    const blob = new Blob([new Uint8Array(img.bytes)], { type: img.mime });
    form.append(images.length > 1 ? "image[]" : "image", blob, `ref-${i}.${ext}`);
  });
  if (mask) {
    const blob = new Blob([new Uint8Array(mask.bytes)], {
      type: mask.mime || "image/png",
    });
    form.append("mask", blob, "mask.png");
  }
  const res = await fetch(`${baseUrl}/images/edits`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `image edit ${res.status}`);
  }
  const b64 = json.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  const url = json.data?.[0]?.url;
  if (!url) throw new Error("no image");
  const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!img.ok) throw new Error(`fetch image ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

async function geminiImage(
  model: string,
  prompt: string,
  images?: { mime: string; bytes: Buffer }[]
) {
  const { apiKey } = geminiEnv();
  if (model.startsWith("imagen")) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1 },
        }),
        signal: AbortSignal.timeout(90_000),
      }
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      predictions?: Array<{ bytesBase64Encoded?: string }>;
    };
    if (!res.ok) throw new Error(json.error?.message || `imagen ${res.status}`);
    const b64 = json.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error("no image");
    return Buffer.from(b64, "base64");
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              ...(images ?? []).map((img) => ({
                inlineData: {
                  mimeType: img.mime,
                  data: img.bytes.toString("base64"),
                },
              })),
              { text: prompt },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: AbortSignal.timeout(90_000),
    }
  );
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };
  if (!res.ok) throw new Error(json.error?.message || `gemini image ${res.status}`);
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("no image");
  return Buffer.from(part.inlineData.data, "base64");
}

export async function generateImageFile(opts: {
  prompt: string;
  size?: string;
  config: PetConfig;
  title?: string;
  images?: { mime: string; bytes: Buffer }[];
  mask?: { mime: string; bytes: Buffer };
}) {
  const resolved = resolveImageModel(opts.config);
  if ("error" in resolved) {
    throw new Error(resolved.error);
  }
  const refs = opts.images?.filter((img) => img.bytes.length) ?? [];
  const bytes =
    resolved.provider === "openai"
      ? refs.length
        ? await openaiImageEdit("gpt-image-1", opts.prompt, refs, opts.mask)
        : await openaiImage(resolved.model, opts.prompt, opts.size)
      : await geminiImage(resolved.model, opts.prompt, refs);
  const artifact = putArtifact({
    mime: "image/png",
    bytes,
    title: opts.title || opts.prompt.slice(0, 40),
    kind: "image",
  });
  return {
    ok: true,
    saved: false,
    model: `${resolved.provider}:${resolved.model}`,
    artifact: {
      kind: "image" as const,
      id: artifact.id,
      title: artifact.title,
    },
  };
}
