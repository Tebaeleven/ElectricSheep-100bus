import { Mastra } from "@mastra/core"

import { ghost, GHOST_AGENT_ID } from "./agents/ghost.js"
import { createStorage } from "./storage.js"

export { GHOST_AGENT_ID, ghost }
export { createStorage }

export const mastra = new Mastra({
  storage: createStorage(process.env),
  agents: { ghost },
})
