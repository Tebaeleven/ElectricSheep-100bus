import { isLoopbackHost } from "@/lib/agent/guard";
import { lanIPv4, requestPort } from "@/lib/companion/lan";
import {
  codeExpiresAt,
  currentCode,
  isPaired,
  listPets,
} from "@/lib/companion/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isLoopbackHost(req)) {
    return new Response("loopback only", { status: 403 });
  }
  const code = currentCode();
  const lanIp = lanIPv4();
  const port = requestPort(req);
  const url = code && lanIp ? `http://${lanIp}:${port}/pocket?code=${code}` : null;
  return Response.json({
    code,
    url,
    qr: null,
    lanIp,
    port,
    expiresAt: codeExpiresAt(),
    paired: isPaired(),
    pets: listPets(),
  });
}
