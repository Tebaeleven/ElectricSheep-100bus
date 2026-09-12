import { PARCEL_MAX_BYTES } from "@/lib/companion/protocol";
import {
  clearParcel,
  getParcel,
  isCompanionAuthorized,
  setParcel,
} from "@/lib/companion/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCompanionAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  const parcel = id ? getParcel(id) : null;
  if (!parcel) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(parcel.bytes), {
    headers: {
      "content-type": parcel.mime,
      "cache-control": "no-store",
      "content-disposition": `inline; filename="${encodeURIComponent(parcel.name)}"`,
    },
  });
}

export async function POST(req: Request) {
  if (!isCompanionAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.id !== "string") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  if (body.clear === true) {
    clearParcel(body.id);
    return Response.json({ ok: true });
  }
  if (typeof body.data !== "string" || typeof body.mime !== "string") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const raw = body.data.replace(/^data:[^;]+;base64,/, "");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw, "base64");
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  if (!bytes.length || bytes.length > PARCEL_MAX_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }
  const meta = setParcel({
    petId: body.id,
    name: typeof body.name === "string" ? body.name : "photo.jpg",
    mime: body.mime,
    bytes,
  });
  if (!meta) return Response.json({ error: "invalid" }, { status: 400 });
  return Response.json(meta);
}
