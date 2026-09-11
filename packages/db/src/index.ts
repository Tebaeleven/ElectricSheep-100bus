import type { RobotCommand, RobotResult } from "@workspace/robot"

import type { ServiceClient } from "./server.js"

export type { Database, Json } from "./database.types.js"
export type { ServiceClient } from "./server.js"
export { createServiceClient } from "./server.js"

export interface RobotCommandLogEntry {
  threadId?: string
  command: RobotCommand
  result: RobotResult
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
      command: entry.command as never,
      status: entry.result.ok ? "ok" : "error",
      result: entry.result as never,
    } as never)
    if (error) console.warn("[db] robot_commands insert failed", error.message)
  } catch (cause) {
    console.warn("[db] robot_commands insert threw", cause)
  }
}
