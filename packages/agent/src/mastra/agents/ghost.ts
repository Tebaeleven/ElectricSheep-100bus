import { Agent } from "@mastra/core/agent"
import { Memory } from "@mastra/memory"

export const GHOST_AGENT_ID = "ghost-agent"

/** 空中に浮かぶおばけロボットの会話エージェント（instructions と tools は E レーンで確定） */
export const ghost = new Agent({
  id: GHOST_AGENT_ID,
  name: "Ghost Robot",
  instructions: "（仮）あなたは空中に浮かぶおばけロボット。短く日本語で答える。",
  model: process.env.GHOST_MODEL ?? "anthropic/claude-sonnet-5",
  memory: new Memory({
    options: {
      lastMessages: 20,
      workingMemory: { enabled: false },
      semanticRecall: false,
    },
  }),
})
