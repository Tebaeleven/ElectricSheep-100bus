import { isLoopbackHost } from "@/lib/agent/guard";
import { tokenFromRequest } from "@/lib/companion/lan";
import type { CompanionSpeaker } from "@/lib/companion/protocol";
import {
  hasSession,
  isCompanionAuthorized,
  postMessage,
} from "@/lib/companion/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function speakerFromRequest(
  req: Request,
  asPet: boolean
): CompanionSpeaker | null {
  const token = tokenFromRequest(req);
  if (token && hasSession(token)) return "phone";
  if (isLoopbackHost(req)) return asPet ? "pet" : "pc";
  return null;
}

export async function POST(req: Request) {
  if (!isCompanionAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const from = speakerFromRequest(req, body.as === "pet");
  if (!from) return new Response("unauthorized", { status: 401 });
  if (typeof body.id !== "string" || typeof body.text !== "string") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const result = postMessage({ petId: body.id, from, text: body.text });
  if (!result.ok) {
    const status = result.error === "asleep" ? 409 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json(result);
}
