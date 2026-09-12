import { isLoopbackHost } from "@/lib/agent/guard";
import { mergePets } from "@/lib/companion/store";
import type { CompanionLocation, CompanionPet } from "@/lib/companion/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isLoopbackHost(req)) {
    return new Response("loopback only", { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { pets?: unknown };
  const pets: CompanionPet[] = [];
  if (Array.isArray(body.pets)) {
    for (const row of body.pets) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (typeof r.id !== "string") continue;
      const location: CompanionLocation =
        r.location === "phone" || r.location === "transit" || r.location === "pc"
          ? r.location
          : "pc";
      pets.push({
        id: r.id,
        icon: typeof r.icon === "string" ? r.icon : `/party/${r.id}/02.webp`,
        accent: typeof r.accent === "string" ? r.accent : "#94a3b8",
        status:
          typeof r.status === "string"
            ? (r.status as CompanionPet["status"])
            : "idle",
        location,
        bubble: typeof r.bubble === "string" ? r.bubble : undefined,
      });
    }
  }
  mergePets(pets);
  return Response.json({ ok: true });
}
