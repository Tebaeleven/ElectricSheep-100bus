import { isLoopbackRequest } from "@/lib/agent/guard";
import { getArtifact } from "@/lib/agent/store";
import { buildXlsx, safeDownloadName } from "@/lib/agent/xlsx";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function underHome(dest: string) {
  const home = os.homedir();
  const resolved = path.resolve(dest);
  return resolved === home || resolved.startsWith(home + path.sep);
}

export async function GET(req: Request) {
  if (!isLoopbackRequest(req)) {
    return new Response("loopback only", { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const blob = id ? getArtifact(id) : undefined;
  if (!blob) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      "content-type": blob.mime,
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  if (!isLoopbackRequest(req)) {
    return new Response("loopback only", { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    dest?: string;
    filename?: string;
    id?: string;
    kind?: string;
    title?: string;
    headers?: string[];
    rows?: string[][];
  };
  const dest = typeof body.dest === "string" ? path.resolve(body.dest) : "";
  if (!dest || !underHome(dest)) {
    return Response.json({ error: "bad dest" }, { status: 400 });
  }
  await fs.mkdir(dest, { recursive: true });

  if (body.kind === "sheet") {
    const headers = Array.isArray(body.headers) ? body.headers.map(String) : ["A"];
    const rows = Array.isArray(body.rows)
      ? body.rows.map((row) => (Array.isArray(row) ? row.map(String) : []))
      : [];
    const name =
      (typeof body.filename === "string" && body.filename.trim()) ||
      safeDownloadName(body.title ?? "sheet", "xlsx");
    const file = path.join(dest, path.basename(name));
    await fs.writeFile(file, buildXlsx(headers, rows));
    return Response.json({ ok: true, path: file });
  }

  const blob = body.id ? getArtifact(body.id) : undefined;
  if (!blob) return Response.json({ error: "not found" }, { status: 404 });
  const name =
    (typeof body.filename === "string" && body.filename.trim()) ||
    safeDownloadName(blob.title ?? "image", "png");
  const file = path.join(dest, path.basename(name));
  await fs.writeFile(file, blob.bytes);
  return Response.json({ ok: true, path: file });
}
