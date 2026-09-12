"use client";

import { motion } from "framer-motion";
import {
  spriteForGhostLook,
  type MoveDir,
} from "@/data/ghost-looks";
import type { GhostStatus } from "@/data/ghost";
import { cn } from "@/lib/utils";

type GhostSpriteProps = {
  status: GhostStatus;
  moveDir?: MoveDir;
  loading?: boolean;
  mouthOpen?: boolean;
  eyeTick?: number;
  className?: string;
  /** Default fills sticky: tall Obake art is ~1:2 */
  sizeClassName?: string;
  floatAmp?: number;
  floatSpeed?: number;
};

export function GhostSprite({
  status,
  moveDir = null,
  loading = false,
  mouthOpen = false,
  eyeTick = 0,
  className,
  sizeClassName = "h-full w-auto max-w-full",
  floatAmp = 6,
  floatSpeed = 4.2,
}: GhostSpriteProps) {
  const src = spriteForGhostLook({
    status,
    moveDir,
    loading,
    mouthOpen,
    eyeTick,
  });

  return (
    <motion.img
      key={src}
      src={src}
      alt=""
      draggable={false}
      animate={{ y: [0, -floatAmp, 0] }}
      transition={{
        duration: floatSpeed,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={cn(
        "pointer-events-none object-contain select-none",
        sizeClassName,
        className
      )}
    />
  );
}
