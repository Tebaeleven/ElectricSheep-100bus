import type { PartyMember, PartyStatus } from "@/data/party";
import type { TalkPrompt } from "@/lib/talk";

export type DeskMemberSnap = Pick<
  PartyMember,
  "id" | "status" | "progress" | "icon" | "accent"
>;

export type DeskStatusEvent = {
  type: "status";
  id: string;
  status: PartyStatus;
  progress: number;
};

export type DeskLooksEvent = {
  type: "looks";
  id: string;
  icon: string;
  accent: string;
};

export type DeskHelloEvent = { type: "hello" };

export type DeskSnapshotEvent = {
  type: "snapshot";
  members: DeskMemberSnap[];
  prompt: TalkPrompt | null;
};

export type DeskTalkEvent = {
  type: "talk";
  prompt: TalkPrompt | null;
};

export type DeskTalkOpenEvent = {
  type: "talk-open";
  petId: string;
};

export type DeskTalkReplyEvent = {
  type: "talk-reply";
  petId: string;
  kind: "choice" | "message" | "draw";
  choiceId?: string;
  text?: string;
};

export type DeskTalkNewEvent = {
  type: "talk-new";
  petId: string;
};

export type DeskTalkSwitchEvent = {
  type: "talk-switch";
  petId: string;
  roomId: string;
};

export type DeskPreviewEvent = {
  type: "talk-preview";
  petId?: string;
  artifact: import("@/lib/agent/types").DeskArtifact;
};

export type DeskLocaleEvent = {
  type: "locale";
  locale: "ja" | "en";
};

export type DeskConfigEvent = {
  type: "config";
  id: string;
  config: import("@/lib/pet-config").PetConfig;
};

export type DeskGrantsEvent = {
  type: "grants";
  id: string;
  grants: import("@/lib/grants").PetGrants;
};

export type DeskEvent =
  | DeskStatusEvent
  | DeskHelloEvent
  | DeskSnapshotEvent
  | DeskLooksEvent
  | DeskTalkEvent
  | DeskTalkOpenEvent
  | DeskTalkReplyEvent
  | DeskTalkNewEvent
  | DeskTalkSwitchEvent
  | DeskPreviewEvent
  | DeskLocaleEvent
  | DeskConfigEvent
  | DeskGrantsEvent;

const CHANNEL = "petassist-desk";

function post(payload: DeskEvent) {
  if (typeof window === "undefined") return;
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage(payload);
    ch.close();
  } catch {
    /* ignore */
  }
}

export function publishDeskStatus(
  id: string,
  status: PartyStatus,
  progress: number
) {
  post({ type: "status", id, status, progress });
}

export function publishDeskLooks(id: string, icon: string, accent: string) {
  post({ type: "looks", id, icon, accent });
}

export function publishDeskHello() {
  post({ type: "hello" });
}

export function publishDeskSnapshot(
  members: DeskMemberSnap[],
  prompt: TalkPrompt | null
) {
  post({ type: "snapshot", members, prompt });
}

export function publishDeskTalk(prompt: TalkPrompt | null) {
  post({ type: "talk", prompt });
}

export function publishDeskTalkOpen(petId: string) {
  post({ type: "talk-open", petId });
}

export function publishDeskTalkReply(
  payload: Omit<DeskTalkReplyEvent, "type">
) {
  post({ type: "talk-reply", ...payload });
}

export function publishDeskTalkNew(petId: string) {
  post({ type: "talk-new", petId });
}

export function publishDeskTalkSwitch(petId: string, roomId: string) {
  post({ type: "talk-switch", petId, roomId });
}

export function publishDeskPreview(
  artifact: import("@/lib/agent/types").DeskArtifact,
  petId?: string
) {
  post({ type: "talk-preview", artifact, petId });
}

export function publishDeskLocale(locale: "ja" | "en") {
  post({ type: "locale", locale });
}

export function publishDeskConfig(
  id: string,
  config: import("@/lib/pet-config").PetConfig
) {
  post({ type: "config", id, config });
}

export function publishDeskGrants(
  id: string,
  grants: import("@/lib/grants").PetGrants
) {
  post({ type: "grants", id, grants });
}

export function subscribeDesk(onEvent: (event: DeskEvent) => void) {
  if (typeof window === "undefined") return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  const listener = (e: MessageEvent<DeskEvent>) => {
    if (e.data?.type) onEvent(e.data);
  };
  ch.addEventListener("message", listener);
  return () => {
    ch.removeEventListener("message", listener);
    ch.close();
  };
}
