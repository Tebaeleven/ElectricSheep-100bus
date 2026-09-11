import { z } from "zod"

/** ロボットに送れるコマンド語彙（Web / Agent / モックで共用する唯一の正本） */
export const robotCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move"),
    direction: z.enum(["up", "down", "left", "right", "forward", "back"]),
    durationMs: z.number().int().positive().optional(),
  }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("speak"), text: z.string().max(200) }),
  z.object({
    type: z.literal("emote"),
    emotion: z.enum(["happy", "sad", "surprised", "neutral"]),
  }),
  z.object({
    type: z.literal("raw"),
    path: z.string(),
    method: z.enum(["GET", "POST"]).default("POST"),
    body: z.unknown().optional(),
  }),
])
