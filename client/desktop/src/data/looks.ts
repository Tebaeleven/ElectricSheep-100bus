import type { PartyMember, PartyStatus } from "@/data/party";

export function coatPath(petId: string, frame: string) {
  if (petId === "ghost") return "/ghost/ObakeNormal.webp";
  return `/party/${petId}/${frame}.webp`;
}

export const DEFAULT_ACCENT: Record<string, string> = {
  ghost: "#e56b8c",
};

export function failedSpriteFor(member: PartyMember): string | null {
  if (member.id === "ghost") return "/ghost/ObakeFailed.webp";
  return null;
}

export const FACE_FILES: Record<
  string,
  Partial<Record<"failed" | "stopped", string>>
> = {
  ghost: { failed: "/ghost/ObakeFailed.webp" },
};

export function spriteFor(
  member: PartyMember,
  opts?: { asleep?: boolean }
): string {
  if (opts?.asleep || member.status === "failed") {
    return FACE_FILES[member.id]?.failed ?? "/ghost/ObakeFailed.webp";
  }
  if (member.status === "working" || member.status === "need_approval") {
    return "/ghost/ObakeNormal.webp";
  }
  if (member.status === "stopped" && FACE_FILES[member.id]?.stopped) {
    return FACE_FILES[member.id]!.stopped!;
  }
  return member.icon || "/ghost/ObakeNormal.webp";
}

export function gaugeFill(status: PartyStatus, accent: string): string {
  if (status === "failed") return "#dc2626";
  if (status === "done") return "#059669";
  if (status === "stopped") return "#94a3b8";
  if (status === "need_approval") return "#ea580c";
  return accent;
}
