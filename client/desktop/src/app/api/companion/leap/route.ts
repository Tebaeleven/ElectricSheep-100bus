import { beginLeap, isCompanionAuthorized } from "@/lib/companion/store";
import type { CompanionDevice } from "@/lib/companion/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function device(raw: unknown): CompanionDevice | null {
  return raw === "pc" || raw === "phone" ? raw : null;
}

export async function POST(req: Request) {
  if (!isCompanionAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const from = device(body.from);
  const to = device(body.to);
  if (typeof body.id !== "string" || !from || !to) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const event = beginLeap({
    id: body.id,
    from,
    to,
    durationMs: typeof body.durationMs === "number" ? body.durationMs : undefined,
    overlapAt: typeof body.overlapAt === "number" ? body.overlapAt : undefined,
    t0: typeof body.t0 === "number" ? body.t0 : undefined,
  });
  if (!event) return Response.json({ error: "invalid" }, { status: 400 });
  return Response.json(event);
}
