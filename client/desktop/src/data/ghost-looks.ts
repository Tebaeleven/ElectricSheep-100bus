import type { GhostStatus } from "@/data/ghost";

/** Obake pack (webp). */
export const OBAKE = {
  normal: "/ghost/ObakeNormal.webp",
  failed: "/ghost/ObakeFailed.webp",
  goL: "/ghost/ObakeGoL.webp",
  goR: "/ghost/ObakeGoR.webp",
  open: "/ghost/ObakeOpen.webp",
  normalU: "/ghost/ObakeNormalU.webp",
  normalD: "/ghost/ObakeNormalD.webp",
  normalL: "/ghost/ObakeNormalL.webp",
  normalR: "/ghost/ObakeNormalR.webp",
  openU: "/ghost/ObakeOpenU.webp",
  openD: "/ghost/ObakeOpenD.webp",
  openL: "/ghost/ObakeOpenL.webp",
  openR: "/ghost/ObakeOpenR.webp",
} as const;

export type EyeDir = "U" | "D" | "L" | "R";
export type MoveDir = "L" | "R" | null;

export const LOADING_EYE_CYCLE: EyeDir[] = ["U", "R", "D", "L"];

export type GhostLookInput = {
  status: GhostStatus;
  moveDir?: MoveDir;
  loading?: boolean;
  eyeTick?: number;
  mouthOpen?: boolean;
};

function eyeSprite(open: boolean, dir: EyeDir): string {
  if (open) {
    if (dir === "U") return OBAKE.openU;
    if (dir === "D") return OBAKE.openD;
    if (dir === "L") return OBAKE.openL;
    return OBAKE.openR;
  }
  if (dir === "U") return OBAKE.normalU;
  if (dir === "D") return OBAKE.normalD;
  if (dir === "L") return OBAKE.normalL;
  return OBAKE.normalR;
}

export function spriteForGhostLook(input: GhostLookInput): string {
  const {
    status,
    moveDir = null,
    loading = false,
    eyeTick = 0,
    mouthOpen = false,
  } = input;

  if (status === "failed") return OBAKE.failed;
  if (moveDir === "L") return OBAKE.goL;
  if (moveDir === "R") return OBAKE.goR;

  // Loading: Normal (mouth closed) + eye wander. Never Open.
  if (loading) {
    const dir = LOADING_EYE_CYCLE[
      ((eyeTick % LOADING_EYE_CYCLE.length) + LOADING_EYE_CYCLE.length) %
        LOADING_EYE_CYCLE.length
    ];
    return eyeSprite(false, dir);
  }

  const open = mouthOpen || status === "talking";
  if (open) return OBAKE.open;
  return OBAKE.normal;
}

export function spriteForGhost(status: GhostStatus): string {
  return spriteForGhostLook({ status });
}
