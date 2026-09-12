import { DEFAULT_GRANTS, parseGrants, type PetGrants } from "@/lib/grants";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackHost(req: Request) {
  const host = (req.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
  return LOOPBACK.has(host);
}

export function isLoopbackRequest(req: Request) {
  const host = (req.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (host) return LOOPBACK.has(host);
  try {
    const hostname = new URL(req.url).hostname.toLowerCase();
    return LOOPBACK.has(hostname);
  } catch {
    return false;
  }
}

export function allowFullAccess() {
  return process.env.PETASSIST_ALLOW_FULL_ACCESS === "1";
}

/** Drop remote callers and unsigned full_access. Filmed TrueForge jobs stay read-only. */
export function grantsFromRequest(
  raw: unknown,
  req: Request,
  requireHarness: boolean
): PetGrants {
  if (!isLoopbackRequest(req) || requireHarness) return { ...DEFAULT_GRANTS };
  const parsed = parseGrants(raw);
  if (parsed.sandbox === "full_access" && !allowFullAccess()) {
    return parsed.folders.length
      ? { sandbox: "workspace", folders: parsed.folders }
      : { ...DEFAULT_GRANTS };
  }
  return parsed;
}
