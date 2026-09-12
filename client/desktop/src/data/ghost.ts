export type GhostStatus = "idle" | "talking" | "failed";

export type GhostCompanion = {
  id: "ghost";
  name: "Ghost";
  nameJa: "お化け";
  accent: string;
  status: GhostStatus;
};

export const GHOST: GhostCompanion = {
  id: "ghost",
  name: "Ghost",
  nameJa: "お化け",
  accent: "#e56b8c",
  status: "idle",
};

/** Primary care action only — mood quick-picks removed. */
export type CareAction = {
  id: "speak";
  label: string;
  primary: boolean;
  prompt: string | null;
};

export const CARE_ACTIONS: CareAction[] = [
  { id: "speak", label: "いまの調子を話す", primary: true, prompt: null },
];

export const DEFAULT_WAKE_WORDS = ["おばけちゃん"];
