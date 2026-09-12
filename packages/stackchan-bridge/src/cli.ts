/**
 * bridge の起動エントリ（`pnpm stackchan:bridge`）。
 * env: STACKCHAN_BRIDGE_PORT（既定 8030）/ STACKCHAN_BRIDGE_HOST（既定 0.0.0.0）/
 *      STACKCHAN_BRIDGE_PCM_BUFFER_MS（既定 10000）
 */
import { bridgeOptionsFromEnv, createBridge } from "./server"

async function main(): Promise<void> {
  const options = bridgeOptionsFromEnv(process.env)
  const bridge = createBridge(options)
  const { port } = await bridge.start()
  const host = options.host ?? "0.0.0.0"

  console.info(`[bridge] ws:     ws://${host}:${port}/obake/media（機器が接続）`)
  console.info(`[bridge] status: http://127.0.0.1:${port}/obake/status`)
  console.info(`[bridge] image:  http://127.0.0.1:${port}/obake/latest.jpg`)
  console.info(`[bridge] head:   POST http://127.0.0.1:${port}/obake/head`)

  const shutdown = (signal: string): void => {
    console.info(`[bridge] ${signal} 受信・停止します`)
    void bridge.stop().then(() => process.exit(0))
  }
  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

void main().catch((error: unknown) => {
  console.error("[bridge] 起動に失敗しました:", error)
  process.exitCode = 1
})
