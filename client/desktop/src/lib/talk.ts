export type TalkMode = "alert" | "choice" | "chat";

export type TalkChoice = {
  id: string;
  label: string;
};

export const DESK_ID = "desk";

export type ChatRole = "user" | "pet" | "system";

export type ChatLine = {
  id: string;
  role: ChatRole;
  text: string;
  at: number;
  label?: string;
  imageUrl?: string;
};

export type TalkAttachment = {
  id: string;
  name: string;
  mime: string;
  kind: "image" | "file";
  dataUrl?: string;
  url?: string;
  text?: string;
};

export type TalkPrompt = {
  petId: string;
  mode: TalkMode;
  text: string;
  detail?: string;
  choices?: TalkChoice[];
  history?: ChatLine[];
  fresh?: boolean;
  streaming?: boolean;
  channel?: "pocket";
  roomId?: string;
  rooms?: { id: string; title: string; updatedAt: number }[];
  artifacts?: import("@/lib/agent/types").DeskArtifact[];
};

export function isDeskTalk(petId: string | null | undefined) {
  return !petId || petId === DESK_ID;
}

export function talkWindowMode(
  prompt: TalkPrompt | null
): "compact" | "alert" | "choice" | "chat" {
  if (!prompt) return "compact";
  return prompt.mode;
}
