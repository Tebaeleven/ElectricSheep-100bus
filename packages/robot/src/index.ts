import { createHttpRobotClient } from "./http"
import { createMockRobotClient } from "./mock"
import type { RobotClient } from "./types"

export { robotCommandSchema } from "./schema"
export { createMockRobotClient } from "./mock"
export { createHttpRobotClient } from "./http"
export type {
  HttpRobotClientOptions,
  RobotClient,
  RobotCommand,
  RobotEndpointMap,
  RobotResult,
} from "./types"

/** ROBOT_MODE=http かつ ROBOT_BASE_URL があれば実機 HTTP、それ以外はモック */
export function createRobotClient(env: NodeJS.ProcessEnv): RobotClient {
  if (env.ROBOT_MODE === "http" && env.ROBOT_BASE_URL) {
    return createHttpRobotClient({ baseUrl: env.ROBOT_BASE_URL })
  }
  return createMockRobotClient()
}
