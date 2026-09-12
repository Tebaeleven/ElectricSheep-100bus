import { isLoopbackRequest } from "@/lib/agent/guard";
import { putArtifact } from "@/lib/agent/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isLoopbackRequest(req)) {
    return new Response("loopback only", { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    mime?: string;
    title?: string;
    data?: string;
  };
  const data = typeof body.data === "string" ? body.data.replace(/^data:[^;]+;base64,/, "") : "";
  if (!data) return Response.json({ error: "empty" }, { status: 400 });
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > 8_000_000) {
    return Response.json({ error: "bad image" }, { status: 400 });
  }
  const mime =
    typeof body.mime === "string" && body.mime.startsWith("image/")
      ? body.mime
      : "image/jpeg";
  const artifact = putArtifact({
    mime,
    bytes,
    title: typeof body.title === "string" ? body.title : "image",
    kind: "image",
  });
  return Response.json({
    id: artifact.id,
    url: `/api/agent/artifact?id=${encodeURIComponent(artifact.id)}`,
  });
}
