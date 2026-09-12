import {
  LEAP_DURATION_MS,
  LEAP_OVERLAP_AT_MS,
  type CompanionChatLine,
  type CompanionDevice,
  type CompanionEvent,
  type CompanionLocation,
  type CompanionPairInfo,
  type CompanionPet,
  type CompanionThreads,
} from "@/lib/companion/protocol";

const PRESENCE_CHANNEL = "petassist-companion";

export type CompanionPresence = {
  paired: boolean;
  locations: Record<string, CompanionLocation>;
};

function postPresence(next: CompanionPresence) {
  try {
    const ch = new BroadcastChannel(PRESENCE_CHANNEL);
    ch.postMessage(next);
    ch.close();
  } catch {
    /* ignore */
  }
}

export function subscribePresence(cb: (next: CompanionPresence) => void) {
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(PRESENCE_CHANNEL);
    ch.onmessage = (ev) => {
      const data = ev.data as CompanionPresence | undefined;
      if (!data || typeof data.paired !== "boolean") return;
      cb(data);
    };
  } catch {
    /* ignore */
  }
  return () => {
    ch?.close();
  };
}

export function publishPresence(next: CompanionPresence) {
  postPresence(next);
}

function jsonHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

export async function pairCompanion(pets: CompanionPet[]) {
  const res = await fetch("/api/companion/pair", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ pets }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `pair failed (${res.status})`);
  }
  return (await res.json()) as CompanionPairInfo;
}

export async function unpairCompanion(token?: string | null) {
  const res = await fetch("/api/companion/unpair", {
    method: "POST",
    headers: jsonHeaders(token),
  });
  return res.ok;
}

export async function joinCompanion(code: string) {
  const res = await fetch("/api/companion/join", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false as const, error: body.error ?? "join_failed" };
  }
  const body = (await res.json()) as {
    token: string;
    pets: CompanionPet[];
    paired: boolean;
    threads?: CompanionThreads;
  };
  return { ...body, ok: true as const };
}

export async function postCompanionMessage(input: {
  id: string;
  text: string;
  token?: string | null;
  as?: "pet";
}) {
  const res = await fetch("/api/companion/message", {
    method: "POST",
    headers: jsonHeaders(input.token),
    body: JSON.stringify({
      id: input.id,
      text: input.text,
      as: input.as,
    }),
  });
  if (res.status === 409) return { ok: false as const, error: "asleep" as const };
  if (!res.ok) return { ok: false as const, error: "invalid" as const };
  const body = (await res.json()) as {
    ok: true;
    line: CompanionChatLine;
    trips: number;
    asleep: boolean;
  };
  return { ...body, ok: true as const };
}

export async function postCompanionParcel(input: {
  id: string;
  name?: string;
  mime?: string;
  data?: string;
  clear?: boolean;
  token?: string | null;
}) {
  const res = await fetch("/api/companion/parcel", {
    method: "POST",
    headers: jsonHeaders(input.token),
    body: JSON.stringify({
      id: input.id,
      name: input.name,
      mime: input.mime,
      data: input.data,
      clear: input.clear,
    }),
  });
  return res.ok;
}

export async function fetchCompanionStatus() {
  const res = await fetch("/api/companion/status");
  if (!res.ok) return null;
  return (await res.json()) as CompanionPairInfo & { pets: CompanionPet[] };
}

export async function syncCompanionPets(pets: CompanionPet[]) {
  await fetch("/api/companion/sync", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ pets }),
  });
}

export async function postLeap(input: {
  id: string;
  from: CompanionDevice;
  to: CompanionDevice;
  token?: string | null;
  durationMs?: number;
  overlapAt?: number;
  t0?: number;
}) {
  const res = await fetch("/api/companion/leap", {
    method: "POST",
    headers: jsonHeaders(input.token),
    body: JSON.stringify({
      id: input.id,
      from: input.from,
      to: input.to,
      durationMs: input.durationMs ?? LEAP_DURATION_MS,
      overlapAt: input.overlapAt ?? LEAP_OVERLAP_AT_MS,
      t0: input.t0 ?? Date.now(),
    }),
  });
  return res.ok;
}

export async function postArrived(input: {
  id: string;
  location: CompanionLocation;
  token?: string | null;
}) {
  const res = await fetch("/api/companion/arrived", {
    method: "POST",
    headers: jsonHeaders(input.token),
    body: JSON.stringify({ id: input.id, location: input.location }),
  });
  return res.ok;
}

export function openCompanionEvents(
  token: string | null,
  onEvent: (event: CompanionEvent) => void
) {
  const url = token
    ? `/api/companion/events?token=${encodeURIComponent(token)}`
    : "/api/companion/events";
  const es = new EventSource(url);
  es.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as CompanionEvent;
      if (event && typeof event.type === "string") onEvent(event);
    } catch {
      /* ignore malformed */
    }
  };
  return () => es.close();
}

export function petsFromParty(
  party: Array<{
    id: string;
    icon: string;
    accent: string;
    status: CompanionPet["status"];
  }>,
  locations: Record<string, CompanionLocation>
): CompanionPet[] {
  return party.map((p) => ({
    id: p.id,
    icon: p.icon,
    accent: p.accent,
    status: p.status,
    location: locations[p.id] ?? "pc",
  }));
}
