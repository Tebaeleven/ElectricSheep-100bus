import QRCode from "qrcode";
import { isLoopbackHost } from "@/lib/agent/guard";
import { lanIPv4, requestPort } from "@/lib/companion/lan";
import { startPair } from "@/lib/companion/store";
import type { CompanionPet } from "@/lib/companion/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asPets(raw: unknown): CompanionPet[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string") return [];
    return [
      {
        id: r.id,
        icon: typeof r.icon === "string" ? r.icon : `/party/${r.id}/02.webp`,
        accent: typeof r.accent === "string" ? r.accent : "#94a3b8",
        status: typeof r.status === "string" ? (r.status as CompanionPet["status"]) : "idle",
        location: "pc",
      },
    ];
  });
}

export async function POST(req: Request) {
  if (!isLoopbackHost(req)) {
    return new Response("loopback only", { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { pets?: unknown };
  const { code, expiresAt } = startPair(asPets(body.pets));
  const lanIp = lanIPv4();
  const port = requestPort(req);
  const url = lanIp ? `http://${lanIp}:${port}/pocket?code=${code}` : null;
  let qr: string | null = null;
  if (url) {
    try {
      qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });
    } catch {
      qr = null;
    }
  }
  return Response.json({
    code,
    url,
    qr,
    lanIp,
    port,
    expiresAt,
    paired: false,
  });
}
