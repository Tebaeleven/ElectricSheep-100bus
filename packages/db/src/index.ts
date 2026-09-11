import type { RobotCommand, RobotResult } from "@workspace/robot"

import type { Json } from "./database.types.js"
import type { ServiceClient } from "./server.js"

export type { Database, Json } from "./database.types.js"
export type { ServiceClient } from "./server.js"
export { createServiceClient } from "./server.js"

export interface RobotCommandLogEntry {
  threadId?: string
  command: RobotCommand
  result: RobotResult
}

/**
 * 構造体を jsonb カラム用の Json 型へ落とす。
 * RobotResult は interface のため暗黙のインデックスシグネチャを持たず Json に直接代入できないので、
 * JSON シリアライズ可能であることをここで一度だけ保証する。
 */
function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

/** robot_commands へのログ。client が無い / 失敗した場合もアプリを落とさない */
export async function logRobotCommand(
  client: ServiceClient | null,
  entry: RobotCommandLogEntry
): Promise<void> {
  if (!client) return

  try {
    const { error } = await client.from("robot_commands").insert({
      thread_id: entry.threadId ?? null,
      command: toJson(entry.command),
      status: entry.result.ok ? "ok" : "error",
      result: toJson(entry.result),
    })
    if (error) console.warn("[db] robot_commands insert failed", error.message)
  } catch (cause) {
    console.warn("[db] robot_commands insert threw", cause)
  }
}
