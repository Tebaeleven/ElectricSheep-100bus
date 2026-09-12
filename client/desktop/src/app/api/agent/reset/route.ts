import { resetAgents } from "@/lib/agent/run";
import { isLoopbackRequest } from "@/lib/agent/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isLoopbackRequest(req)) {
    return Response.json({ ok: false, error: "loopback only" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { petId?: string };
  resetAgents(typeof body.petId === "string" ? body.petId : undefined);
  return Response.json({ ok: true });
}
