import { isCompanionAuthorized, markArrived } from "@/lib/companion/store";
import type { CompanionLocation } from "@/lib/companion/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCompanionAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const location =
    body.location === "pc" || body.location === "phone" || body.location === "transit"
      ? (body.location as CompanionLocation)
      : null;
  if (typeof body.id !== "string" || !location) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const pet = markArrived(body.id, location);
  if (!pet) return Response.json({ error: "invalid" }, { status: 400 });
  return Response.json(pet);
}
