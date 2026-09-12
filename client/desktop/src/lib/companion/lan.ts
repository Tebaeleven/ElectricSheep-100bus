import os from "os";

function isPrivateIPv4(ip: string) {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function lanIPv4(): string | null {
  const nets = os.networkInterfaces();
  const ranked: string[] = [];
  for (const addrs of Object.values(nets)) {
    for (const net of addrs ?? []) {
      const family = String(net.family);
      if (family !== "IPv4" && family !== "4") continue;
      if (net.internal) continue;
      const ip = net.address;
      if (ip.startsWith("169.254.")) continue;
      if (!isPrivateIPv4(ip)) continue;
      ranked.push(ip);
    }
  }
  return (
    ranked.find((ip) => ip.startsWith("192.168.")) ??
    ranked.find((ip) => ip.startsWith("10.")) ??
    ranked[0] ??
    null
  );
}

export function requestPort(req: Request): number {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const fromHost = host.split(":")[1];
  if (fromHost && /^\d+$/.test(fromHost)) return Number(fromHost);
  try {
    const port = new URL(req.url).port;
    if (port) return Number(port);
  } catch {
    /* ignore */
  }
  const env = process.env.PORT;
  if (env && /^\d+$/.test(env)) return Number(env);
  return 3000;
}

export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("token")?.trim();
    if (q) return q;
  } catch {
    /* ignore */
  }
  return null;
}
