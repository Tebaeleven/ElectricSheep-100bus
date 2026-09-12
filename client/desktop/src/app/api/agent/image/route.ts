import { generateImageFile } from "@/lib/agent/images";
import { isLoopbackRequest } from "@/lib/agent/guard";
import { getArtifact } from "@/lib/agent/store";
import { parsePetConfig } from "@/lib/pet-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ImageRef = { mime?: string; data?: string; id?: string };

async function refsFrom(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const out: { mime: string; bytes: Buffer }[] = [];
  for (const row of raw as ImageRef[]) {
    if (row?.id) {
      const blob = getArtifact(row.id);
      if (blob) out.push({ mime: blob.mime, bytes: blob.bytes });
      continue;
    }
    const data =
      typeof row?.data === "string"
        ? row.data.replace(/^data:[^;]+;base64,/, "")
        : "";
    if (!data) continue;
    const bytes = Buffer.from(data, "base64");
    if (!bytes.length) continue;
    out.push({
      mime:
        typeof row.mime === "string" && row.mime.startsWith("image/")
          ? row.mime
          : "image/jpeg",
      bytes,
    });
  }
  return out;
}

export async function POST(req: Request) {
  if (!isLoopbackRequest(req)) {
    return new Response("loopback only", { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    title?: string;
    size?: string;
    config?: unknown;
    images?: ImageRef[];
    mask?: ImageRef;
  };
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const images = await refsFrom(body.images);
  const maskList = await refsFrom(body.mask ? [body.mask] : []);
  if (!prompt && !images.length) {
    return Response.json({ error: "empty prompt" }, { status: 400 });
  }
  try {
    const result = await generateImageFile({
      prompt: prompt || "this image",
      title: typeof body.title === "string" ? body.title : undefined,
      size: typeof body.size === "string" ? body.size : undefined,
      config: parsePetConfig(body.config),
      images,
      mask: maskList[0],
    });
    return Response.json({
      id: result.artifact.id,
      title: result.artifact.title,
      url: `/api/agent/artifact?id=${encodeURIComponent(result.artifact.id)}`,
      model: result.model,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "image failed" },
      { status: 500 }
    );
  }
}
