export type PermissionTier = "L0" | "L1" | "L2" | "L3";
export type PartyStatus =
  | "idle"
  | "working"
  | "need_approval"
  | "stopped"
  | "failed"
  | "done"
  | "empty";

export type PartyMember = {
  id: string;
  name: string;
  nameJa: string;
  role: string;
  icon: string;
  accent: string;
  progress: number;
  tier: PermissionTier;
  status: PartyStatus;
  allowedTools: string[];
  deniedTools: string[];
  bubbles: Record<PartyStatus, string[]>;
};

/** Ghost Companion is Obake-only — Petassist animals are not in this product. */
export const LIVE_IDS = ["ghost"] as const;

export type LivePetId = (typeof LIVE_IDS)[number];

export const DEFAULT_PARTY_ORDER = ["ghost"] as const;

export function sortByOrder<T extends { id: string }>(
  items: T[],
  order: readonly string[]
): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort(
    (a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99)
  );
}

export const TIER_LABEL: Record<PermissionTier, string> = {
  L0: "みるだけ",
  L1: "れんしゅう",
  L2: "そうあん",
  L3: "しょうにんつき",
};

export const STATUS_LABEL: Record<PartyStatus, string> = {
  idle: "稼働中",
  working: "作業中",
  need_approval: "しょうにんまち",
  stopped: "停止",
  failed: "失敗",
  done: "完了",
  empty: "空き",
};

export const STATUS_DOT: Record<PartyStatus, string> = {
  idle: "bg-emerald-500",
  working: "bg-sky-500",
  need_approval: "bg-orange-500",
  stopped: "bg-slate-400",
  failed: "bg-red-500",
  done: "bg-emerald-500",
  empty: "bg-slate-300",
};

const deskTools = [
  "web_search",
  "save_draft",
  "slack_post",
  "x_post",
  "open_url",
  "take_screenshot",
  "generate_image",
  "make_sheet",
];

const PARTY_SEED: PartyMember[] = [
  {
    id: "ghost",
    name: "ghost",
    nameJa: "お化け",
    role: "コンパニオン",
    icon: "/ghost/ObakeNormal.webp",
    accent: "#e56b8c",
    progress: 0,
    tier: "L0",
    status: "idle",
    allowedTools: deskTools,
    deniedTools: ["elevate_permissions"],
    bubbles: {
      idle: [],
      working: [],
      need_approval: [],
      stopped: [],
      failed: [],
      done: [],
      empty: [],
    },
  },
];

export const INITIAL_PARTY: PartyMember[] = sortByOrder(
  PARTY_SEED,
  DEFAULT_PARTY_ORDER
);

export function pickBubble(member: PartyMember, localized?: string[]): string {
  const list = localized?.length ? localized : member.bubbles[member.status];
  if (!list?.length) return "…";
  return list[Math.floor(Math.random() * list.length)]!;
}

export function isLiveAgent(id: string): id is LivePetId {
  return (LIVE_IDS as readonly string[]).includes(id);
}
