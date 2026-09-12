/**
 * 偽スタックちゃん（実機なしで bridge を動かすための機器モック）。
 *
 * `pnpm stackchan:mock-device` で起動し、ファームと同じように
 * bridge の `ws://127.0.0.1:8030/obake/media` へ WS クライアントとして接続して
 * hello → JPEG（400ms 間隔）→ PCM（200ms 間隔）を push し、`set_head` を受けたらログに出す。
 *
 * 接続先の変更: `--url ws://192.168.0.5:8030/obake/media` または env STACKCHAN_BRIDGE_WS_URL
 */
import WebSocket from "ws"

import {
  BRIDGE_PORT_DEFAULT,
  encodeFrame,
  encodeHello,
  FRAME_TYPE_JPEG,
  FRAME_TYPE_PCM,
  MEDIA_WS_PATH,
  PCM_BYTES_PER_SAMPLE,
} from "./protocol"
import { TEST_JPEG_FRAMES } from "./test-frames"

/** ファーム既定と同じ送出間隔 */
const JPEG_INTERVAL_MS = 400
const PCM_INTERVAL_MS = 200

/** 偽機器が名乗るサンプリングレート */
const MOCK_PCM_RATE = 24000

/** 正弦波の周波数（Hz）と振幅 */
const TONE_HZ = 440
const TONE_AMPLITUDE = 8000

/** 切断されたときの再接続待ち（ミリ秒） */
const RECONNECT_DELAY_MS = 1000

/** `--url <ws://...>` / env / 既定の順に接続先を決める */
function resolveUrl(argv: string[], env: NodeJS.ProcessEnv): string {
  const index = argv.indexOf("--url")
  const fromArgv = index >= 0 ? argv[index + 1] : undefined
  return (
    fromArgv ??
    env.STACKCHAN_BRIDGE_WS_URL ??
    `ws://127.0.0.1:${env.STACKCHAN_BRIDGE_PORT ?? BRIDGE_PORT_DEFAULT}${MEDIA_WS_PATH}`
  )
}

/** 16-bit LE モノラルの正弦波を durationMs ぶん作る */
function createTone(
  pcmRate: number,
  durationMs: number,
  startSample: number
): Buffer {
  const samples = Math.floor((pcmRate * durationMs) / 1000)
  const buffer = Buffer.allocUnsafe(samples * PCM_BYTES_PER_SAMPLE)
  for (let i = 0; i < samples; i += 1) {
    const t = (startSample + i) / pcmRate
    const value = Math.round(Math.sin(2 * Math.PI * TONE_HZ * t) * TONE_AMPLITUDE)
    buffer.writeInt16LE(value, i * PCM_BYTES_PER_SAMPLE)
  }
  return buffer
}

/** 1 回の接続ぶんの送信ループ。切断されたら resolve する */
function runOnce(url: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const socket = new WebSocket(url)
    const timers: ReturnType<typeof setInterval>[] = []
    let frameIndex = 0
    let sampleCursor = 0

    const stop = (): void => {
      for (const timer of timers) clearInterval(timer)
      timers.length = 0
    }

    socket.on("open", () => {
      console.info(`[mock-device] connected: ${url}`)
      socket.send(encodeHello(MOCK_PCM_RATE))

      timers.push(
        setInterval(() => {
          const base64 = TEST_JPEG_FRAMES[frameIndex % TEST_JPEG_FRAMES.length]!
          frameIndex += 1
          socket.send(
            encodeFrame(FRAME_TYPE_JPEG, Buffer.from(base64, "base64"))
          )
        }, JPEG_INTERVAL_MS)
      )

      timers.push(
        setInterval(() => {
          const pcm = createTone(MOCK_PCM_RATE, PCM_INTERVAL_MS, sampleCursor)
          sampleCursor += pcm.length / PCM_BYTES_PER_SAMPLE
          socket.send(encodeFrame(FRAME_TYPE_PCM, pcm))
        }, PCM_INTERVAL_MS)
      )
    })

    socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) return
      console.info(`[mock-device] recv: ${data.toString("utf8").slice(0, 200)}`)
    })

    socket.on("error", (error: Error) => {
      console.warn(`[mock-device] error: ${error.message}`)
    })

    socket.on("close", () => {
      stop()
      console.info("[mock-device] disconnected")
      resolve()
    })
  })
}

async function main(): Promise<void> {
  const url = resolveUrl(process.argv.slice(2), process.env)
  console.info(`[mock-device] 偽スタックちゃんを起動します -> ${url}`)
  let running = true
  process.on("SIGINT", () => {
    running = false
    process.exit(0)
  })
  while (running) {
    await runOnce(url)
    // 実機ファームと同じく、切れても繰り返し繋ぎ直す
    await new Promise<void>((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS))
  }
}

void main().catch((error: unknown) => {
  console.error("[mock-device] 失敗しました:", error)
  process.exitCode = 1
})
