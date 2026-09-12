import { randomBytes, randomInt } from "crypto";
import { LIVE_IDS } from "@/data/party";
import { isLoopbackHost } from "@/lib/agent/guard";
import {
  CODE_TTL_MS,
  LEAP_DURATION_MS,
  LEAP_OVERLAP_AT_MS,
  MESSAGE_MAX_TEXT,
  MESSAGE_MAX_THREAD,
  MESSAGE_MAX_TRIPS,
  PARCEL_MAX_BYTES,
  countRoundTrips,
  type CompanionChatLine,
  type CompanionDevice,
  type CompanionEvent,
  type CompanionLeapEvent,
  type CompanionLocation,
  type CompanionParcelMeta,
  type CompanionPet,
  type CompanionSpeaker,
  type CompanionThreads,
} from "@/lib/companion/protocol";
import { tokenFromRequest } from "@/lib/companion/lan";

type Listener = (event: CompanionEvent) => void;

type ParcelBlob = CompanionParcelMeta & { bytes: Buffer };

type CompanionState = {
  code: string | null;
  codeExpires: number;
  sessions: Map<string, number>;
  pets: Map<string, CompanionPet>;
  threads: Map<string, CompanionChatLine[]>;
  visits: Map<string, number>;
  parcels: Map<string, ParcelBlob>;
  listeners: Set<Listener>;
  lastLeapTo: Map<string, CompanionDevice>;
};

const g = globalThis as typeof globalThis & {
  __petassistCompanion?: CompanionState;
};

function createState(): CompanionState {
  return {
    code: null,
    codeExpires: 0,
    sessions: new Map(),
    pets: new Map(),
    threads: new Map(),
    visits: new Map(),
    parcels: new Map(),
    listeners: new Set(),
    lastLeapTo: new Map(),
  };
}

function state(): CompanionState {
  if (!g.__petassistCompanion) g.__petassistCompanion = createState();
  const s = g.__petassistCompanion;
  if (!s.threads) s.threads = new Map();
  if (!s.visits) s.visits = new Map();
  if (!s.parcels) s.parcels = new Map();
  if (!s.lastLeapTo) s.lastLeapTo = new Map();
  return s;
}

function prune() {
  const now = Date.now();
  const s = state();
  if (s.code && s.codeExpires < now) {
    s.code = null;
    s.codeExpires = 0;
  }
  for (const [token, exp] of s.sessions) {
    if (exp < now) s.sessions.delete(token);
  }
}

export function isPaired() {
  prune();
  return state().sessions.size > 0;
}

export function currentCode() {
  prune();
  const s = state();
  return s.code && s.codeExpires > Date.now() ? s.code : null;
}

export function codeExpiresAt() {
  prune();
  return state().codeExpires || null;
}

export function listPets(): CompanionPet[] {
  return [...state().pets.values()].map(withVisit);
}

function withVisit(pet: CompanionPet): CompanionPet {
  const s = state();
  const since = s.visits.get(pet.id) ?? 0;
  const trips = countRoundTrips(s.threads.get(pet.id) ?? [], since);
  const parcel = s.parcels.get(pet.id);
  return {
    ...pet,
    trips,
    asleep: Boolean(pet.asleep),
    parcel: parcel
      ? { name: parcel.name, mime: parcel.mime, at: parcel.at }
      : undefined,
  };
}

export function getPet(id: string) {
  const pet = state().pets.get(id);
  return pet ? withVisit(pet) : undefined;
}

export function subscribe(listener: Listener) {
  state().listeners.add(listener);
  return () => {
    state().listeners.delete(listener);
  };
}

function emit(event: CompanionEvent) {
  for (const listener of state().listeners) {
    try {
      listener(event);
    } catch {
      /* ignore a bad subscriber */
    }
  }
}

export function listThreads(): CompanionThreads {
  const out: CompanionThreads = {};
  for (const [id, lines] of state().threads) {
    if (lines.length) out[id] = [...lines];
  }
  return out;
}

export function snapshotEvent(): CompanionEvent {
  return {
    type: "snapshot",
    pets: listPets(),
    paired: isPaired(),
    threads: listThreads(),
  };
}

function newMsgId() {
  return randomBytes(8).toString("hex");
}

function clearThreads() {
  state().threads.clear();
}

function clearVisitState() {
  const s = state();
  s.visits.clear();
  s.parcels.clear();
  for (const pet of s.pets.values()) {
    pet.asleep = false;
    pet.trips = 0;
    pet.parcel = undefined;
  }
}

function startVisit(id: string) {
  const s = state();
  s.visits.set(id, Date.now());
  const pet = s.pets.get(id);
  if (pet) pet.asleep = false;
}

function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function newToken() {
  return randomBytes(24).toString("hex");
}

export function startPair(pets?: CompanionPet[]) {
  const s = state();
  s.code = newCode();
  s.codeExpires = Date.now() + CODE_TTL_MS;
  s.sessions.clear();
  clearThreads();
  clearVisitState();
  if (pets?.length) mergePets(pets, { resetLocation: true });
  emit({ type: "unpaired" });
  emit(snapshotEvent());
  return { code: s.code, expiresAt: s.codeExpires };
}

export function unpair() {
  const s = state();
  s.code = null;
  s.codeExpires = 0;
  s.sessions.clear();
  clearThreads();
  clearVisitState();
  for (const pet of s.pets.values()) {
    if (pet.location !== "pc") pet.location = "pc";
  }
  emit({ type: "unpaired" });
  emit(snapshotEvent());
}

export function joinWithCode(code: string) {
  prune();
  const s = state();
  const trimmed = code.replace(/\s/g, "");
  if (!s.code || s.code !== trimmed || s.codeExpires < Date.now()) {
    return null;
  }
  const token = newToken();
  s.sessions.set(token, Date.now() + 24 * 60 * 60 * 1000);
  emit({ type: "paired" });
  emit(snapshotEvent());
  return token;
}

export function hasSession(token: string) {
  prune();
  return state().sessions.has(token);
}

export function isCompanionAuthorized(req: Request) {
  if (isLoopbackHost(req)) return true;
  const token = tokenFromRequest(req);
  return Boolean(token && hasSession(token));
}

function knownId(id: string) {
  return (LIVE_IDS as readonly string[]).includes(id);
}

export function mergePets(
  incoming: CompanionPet[],
  opts: { resetLocation?: boolean } = {}
) {
  const s = state();
  for (const row of incoming) {
    if (!knownId(row.id)) continue;
    const prev = s.pets.get(row.id);
    const location: CompanionLocation = opts.resetLocation
      ? "pc"
      : prev && (prev.location === "phone" || prev.location === "transit")
        ? prev.location
        : prev
          ? prev.location
          : (row.location ?? "pc");
    s.pets.set(row.id, {
      id: row.id,
      icon: row.icon,
      accent: row.accent,
      status: row.status,
      location,
      bubble: row.bubble,
      asleep: prev?.asleep ?? false,
    });
  }
  emit(snapshotEvent());
}

export function beginLeap(input: {
  id: string;
  from: CompanionDevice;
  to: CompanionDevice;
  durationMs?: number;
  overlapAt?: number;
  t0?: number;
}): CompanionLeapEvent | null {
  if (!knownId(input.id)) return null;
  if (input.from === input.to) return null;
  const s = state();
  const pet = s.pets.get(input.id);
  if (pet) pet.location = "transit";
  else {
    s.pets.set(input.id, {
      id: input.id,
      icon: `/party/${input.id}/02.webp`,
      accent: "#94a3b8",
      status: "idle",
      location: "transit",
    });
  }
  s.lastLeapTo.set(input.id, input.to);
  if (input.to === "phone") startVisit(input.id);
  const event: CompanionLeapEvent = {
    type: "leap",
    id: input.id,
    from: input.from,
    to: input.to,
    durationMs: input.durationMs ?? LEAP_DURATION_MS,
    overlapAt: input.overlapAt ?? LEAP_OVERLAP_AT_MS,
    t0: input.t0 ?? Date.now(),
  };
  emit(event);
  emit(snapshotEvent());
  return event;
}

export function markArrived(id: string, location: CompanionLocation) {
  if (!knownId(id)) return null;
  const s = state();
  const dest = s.lastLeapTo.get(id);
  if (dest && dest !== location) return getPet(id) ?? null;
  const pet = s.pets.get(id);
  if (pet) pet.location = location;
  else {
    s.pets.set(id, {
      id,
      icon: `/party/${id}/02.webp`,
      accent: "#94a3b8",
      status: "idle",
      location,
    });
  }
  emit({ type: "arrived", id, location });
  emit(snapshotEvent());
  return getPet(id) ?? null;
}

export type PostMessageResult =
  | { ok: true; line: CompanionChatLine; trips: number; asleep: boolean }
  | { ok: false; error: "asleep" | "invalid" };

export function postMessage(input: {
  petId: string;
  from: CompanionSpeaker;
  text: string;
}): PostMessageResult {
  if (!knownId(input.petId)) return { ok: false, error: "invalid" };
  const text = input.text.trim().slice(0, MESSAGE_MAX_TEXT);
  if (!text) return { ok: false, error: "invalid" };
  const s = state();
  const pet = s.pets.get(input.petId);
  if (pet?.asleep) return { ok: false, error: "asleep" };
  const line: CompanionChatLine = {
    msgId: newMsgId(),
    petId: input.petId,
    from: input.from,
    text,
    at: Date.now(),
  };
  const prev = s.threads.get(input.petId) ?? [];
  const next = [...prev, line].slice(-MESSAGE_MAX_THREAD);
  s.threads.set(input.petId, next);
  const since = s.visits.get(input.petId) ?? 0;
  const trips = countRoundTrips(next, since);
  const asleep = trips >= MESSAGE_MAX_TRIPS;
  if (pet && asleep) pet.asleep = true;
  const live = s.pets.get(input.petId);
  const shouldLeap =
    live?.location === "phone" && (input.from === "phone" || asleep);
  emit({
    type: "message",
    ...line,
    ...(shouldLeap ? { leapTo: "pc" as const } : {}),
  });
  if (shouldLeap) {
    beginLeap({ id: input.petId, from: "phone", to: "pc" });
  } else {
    emit(snapshotEvent());
  }
  return { ok: true, line, trips, asleep };
}

export function setParcel(input: {
  petId: string;
  name: string;
  mime: string;
  bytes: Buffer;
}): CompanionParcelMeta | null {
  if (!knownId(input.petId)) return null;
  if (!input.bytes.length || input.bytes.length > PARCEL_MAX_BYTES) return null;
  const mime = input.mime.startsWith("image/") ? input.mime : "image/jpeg";
  const meta: CompanionParcelMeta = {
    name: input.name.trim().slice(0, 80) || "photo.jpg",
    mime,
    at: Date.now(),
  };
  state().parcels.set(input.petId, { ...meta, bytes: input.bytes });
  emit(snapshotEvent());
  return meta;
}

export function getParcel(petId: string): ParcelBlob | null {
  return state().parcels.get(petId) ?? null;
}

export function clearParcel(petId: string) {
  if (!state().parcels.delete(petId)) return false;
  emit(snapshotEvent());
  return true;
}
