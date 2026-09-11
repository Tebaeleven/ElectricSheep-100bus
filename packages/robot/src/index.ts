import { createMockRobotClient } from "./mock.js"
import type { HttpRobotClientOptions, RobotClient } from "./types.js"

export { robotCommandSchema } from "./schema.js"
export { createMockRobotClient } from "./mock.js"
export type {
  HttpRobotClientOptions,
  RobotClient,
  RobotCommand,
  RobotEndpointMap,
  RobotResult,
} from "./types.js"

/** HTTP 実装。B レーンで実装する */
export function createHttpRobotClient(_options: HttpRobotClientOptions): RobotClient {
  throw new Error("not implemented yet")
}

/** ROBOT_MODE による分岐。実機実装が入るまでは常にモック */
export function createRobotClient(_env: NodeJS.ProcessEnv): RobotClient {
  return createMockRobotClient()
}
