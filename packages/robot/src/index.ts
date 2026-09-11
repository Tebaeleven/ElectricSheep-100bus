import { createHttpRobotClient } from "./http.js"
import { createMockRobotClient } from "./mock.js"
import type { RobotClient } from "./types.js"

export { robotCommandSchema } from "./schema.js"
export { createMockRobotClient } from "./mock.js"
export { createHttpRobotClient } from "./http.js"
export type {
  HttpRobotClientOptions,
  RobotClient,
  RobotCommand,
  RobotEndpointMap,
  RobotResult,
} from "./types.js"

/** ROBOT_MODE=http かつ ROBOT_BASE_URL があれば実機 HTTP、それ以外はモック */
export function createRobotClient(env: NodeJS.ProcessEnv): RobotClient {
  if (env.ROBOT_MODE === "http" && env.ROBOT_BASE_URL) {
    return createHttpRobotClient({ baseUrl: env.ROBOT_BASE_URL })
  }
  return createMockRobotClient()
}
