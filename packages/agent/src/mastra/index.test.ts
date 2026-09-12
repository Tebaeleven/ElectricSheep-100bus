import { describe, expect, it } from "vitest"

import { GHOST_AGENT_ID, ghost, mastra } from "./index"

describe("mastra", () => {
  it("GHOST_AGENT_ID でおばけエージェントを取得できる", () => {
    const agent = mastra.getAgentById(GHOST_AGENT_ID)

    expect(agent).toBe(ghost)
    expect(agent.id).toBe(GHOST_AGENT_ID)
  })

  it("おばけエージェントが robot / devices の tool を一式持つ", async () => {
    const tools = await ghost.listTools()

    expect(Object.keys(tools).sort()).toEqual([
      "cameraCapture",
      "desktopOpenBrowser",
      "desktopScreenshot",
      "handSet",
      "headSet",
      "ledSet",
      "railMove",
      "railStop",
      "robotCommand",
      "robotStatus",
    ])
  })
})
