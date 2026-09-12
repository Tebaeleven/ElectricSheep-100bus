import type { PartyStatus } from "@/data/party";
import type { ChatLine } from "@/lib/talk";

export const LEAP_DURATION_MS = 1100;
export const LEAP_OVERLAP_AT_MS = 700;
export const LEAP_HOPS = 5;
export const CODE_TTL_MS = 5 * 60 * 1000;
export const MESSAGE_MAX_TEXT = 400;
export const MESSAGE_MAX_THREAD = 40;
export const MESSAGE_MAX_TRIPS = 5;
export const PARCEL_MAX_BYTES = 700_000;

export type CompanionLocation = "pc" | "phone" | "transit";
export type CompanionDevice = "pc" | "phone";
export type CompanionSpeaker = CompanionDevice | "pet";

export type CompanionParcelMeta = {
  name: string;
  mime: string;
  at: number;
};

export type CompanionPet = {
  id: string;
  icon: string;
  accent: string;
  status: PartyStatus;
  location: CompanionLocation;
  bubble?: string;
  asleep?: boolean;
  trips?: number;
  parcel?: CompanionParcelMeta;
};

export type CompanionChatLine = {
  msgId: string;
  petId: string;
  from: CompanionSpeaker;
  text: string;
  at: number;
};

export type CompanionThreads = Record<string, CompanionChatLine[]>;

export type CompanionLeapEvent = {
  type: "leap";
  id: string;
  from: CompanionDevice;
  to: CompanionDevice;
  durationMs: number;
  overlapAt: number;
  t0: number;
};

export type CompanionMessageEvent = {
  type: "message";
  leapTo?: CompanionDevice;
} & CompanionChatLine;

export type CompanionSnapshotEvent = {
  type: "snapshot";
  pets: CompanionPet[];
  paired: boolean;
  threads: CompanionThreads;
};

export type CompanionEvent =
  | CompanionSnapshotEvent
  | CompanionLeapEvent
  | CompanionMessageEvent
  | { type: "arrived"; id: string; location: CompanionLocation }
  | { type: "looks"; id: string; icon: string; accent: string }
  | { type: "status"; id: string; status: PartyStatus }
  | { type: "paired" }
  | { type: "unpaired" };

export function countRoundTrips(
  lines: CompanionChatLine[],
  since = 0
): number {
  let trips = 0;
  let open = false;
  for (const line of lines) {
    if (line.at < since) continue;
    if (line.from === "phone") open = true;
    else if (open && (line.from === "pet" || line.from === "pc")) {
      trips += 1;
      open = false;
    }
  }
  return trips;
}

export function companionHistoryFor(
  lines: CompanionChatLine[],
  viewer: CompanionDevice,
  labels?: { phone?: string }
): ChatLine[] {
  return lines.map((line) => {
    if (line.from === "pet") {
      return { id: line.msgId, role: "pet" as const, text: line.text, at: line.at };
    }
    if (line.from === "phone") {
      return {
        id: line.msgId,
        role: "user" as const,
        text: line.text,
        at: line.at,
        label: viewer === "pc" ? labels?.phone : undefined,
      };
    }
    return {
      id: line.msgId,
      role: viewer === "pc" ? ("user" as const) : ("pet" as const),
      text: line.text,
      at: line.at,
    };
  });
}

export function parcelUrl(
  petId: string,
  at: number,
  token?: string | null
) {
  const q = new URLSearchParams({ id: petId, t: String(at) });
  if (token) q.set("token", token);
  return `/api/companion/parcel?${q.toString()}`;
}

export type CompanionPairInfo = {
  code: string | null;
  url: string | null;
  qr: string | null;
  lanIp: string | null;
  port: number;
  expiresAt: number | null;
  paired: boolean;
};
