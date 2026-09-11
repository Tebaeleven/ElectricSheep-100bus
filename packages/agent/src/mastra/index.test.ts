import { describe, expect, it } from "vitest"

import { GHOST_AGENT_ID, ghost, mastra } from "./index"

describe("mastra", () => {
  it("GHOST_AGENT_ID でおばけエージェントを取得できる", () => {
    const agent = mastra.getAgentById(GHOST_AGENT_ID)

    expect(agent).toBe(ghost)
    expect(agent.id).toBe(GHOST_AGENT_ID)
  })

  it("おばけエージェントが robotCommand / robotStatus を持つ", async () => {
    const tools = await ghost.listTools()

    expect(Object.keys(tools).sort()).toEqual([
      "cameraCapture",
      "desktopOpenBrowser",
      "desktopScreenshot",
      "handSet",
      "railMove",
      "railStop",
      "robotCommand",
      "robotStatus",
    ])
  })
})
