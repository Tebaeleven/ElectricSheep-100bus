import { isCompanionAuthorized, unpair } from "@/lib/companion/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCompanionAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  unpair();
  return Response.json({ ok: true });
}
