import {
  MOCK_AUDIO_CHUNK_BASE64,
  MOCK_AUDIO_CHUNK_INTERVAL_MS,
  MOCK_PNG_BASE64,
} from "../constants"
import type {
  AudioChunk,
  DeviceResult,
  HandState,
  HeadSet,
  ImagePayload,
  StackchanClient,
  StackchanInbound,
} from "../types"
import { createRequestId } from "../wire"

export interface MockStackchanClient extends StackchanClient {
  /** 直近に指示された首の角度（テスト用） */
  readonly headAngles: HeadSet | undefined
  /** @deprecated 現在の手の状態（旧契約のテスト用） */
  readonly handState: HandState
  /** 録音中かどうか（テスト用） */
  readonly recording: boolean
}

/**
 * スタックちゃん（WebSocket）のモック。
 * audioStart 中は 100ms ごとにダミーの audio.chunk を購読者へ流す
 */
export function createMockStackchanClient(): MockStackchanClient {
  let connected = false
  let handState: HandState = "open"
  let headAngles: HeadSet | undefined
  let recording = false
  let seq = 0
  let timer: ReturnType<typeof setInterval> | undefined
  const audioHandlers = new Set<(chunk: AudioChunk) => void>()
  const eventHandlers = new Set<(msg: StackchanInbound) => void>()

  /** 全購読者へイベントを配る */
  const emitEvent = (msg: StackchanInbound): void => {
    for (const handler of eventHandlers) handler(msg)
  }

  const stopAudioTimer = (): void => {
    if (!timer) return
    clearInterval(timer)
    timer = undefined
  }

  return {
    get connected() {
      return connected
    },
    get headAngles() {
      return headAngles
    },
    get handState() {
      return handState
    },
    get recording() {
      return recording
    },
    async connect(): Promise<void> {
      connected = true
      console.info("[devices:mock] stackchan.connect")
    },
    async close(): Promise<void> {
      stopAudioTimer()
      recording = false
      connected = false
      console.info("[devices:mock] stackchan.close")
    },
    async headSet(input: HeadSet): Promise<DeviceResult> {
      const startedAt = Date.now()
      headAngles = input
      const requestId = createRequestId()
      console.info(
        `[devices:mock] stackchan.head.set yaw=${input.yaw} pitch=${input.pitch}`
      )
      emitEvent({ type: "ack", request_id: requestId, data: { ...input } })
      return {
        ok: true,
        status: 200,
        data: { requestId, ...input },
        latencyMs: Date.now() - startedAt,
      }
    },
    /**
     * @deprecated 実機に手のサーボは無い。モックは旧契約の確認用に動作を残している
     */
    async handSet(state: HandState): Promise<DeviceResult> {
      const startedAt = Date.now()
      handState = state
      const requestId = createRequestId()
      console.info("[devices:mock] stackchan.hand.set", state)
      emitEvent({ type: "ack", request_id: requestId, data: { state } })
      return {
        ok: true,
        status: 200,
        data: { requestId, state },
        latencyMs: Date.now() - startedAt,
      }
    },
    async cameraCapture(): Promise<DeviceResult<ImagePayload>> {
      const startedAt = Date.now()
      const requestId = createRequestId()
      console.info("[devices:mock] stackchan.camera.capture")
      emitEvent({
        type: "camera.frame",
        request_id: requestId,
        data: { mime_type: "image/png", image_base64: MOCK_PNG_BASE64 },
      })
      return {
        ok: true,
        status: 200,
        data: { mimeType: "image/png", imageBase64: MOCK_PNG_BASE64 },
        latencyMs: Date.now() - startedAt,
      }
    },
    async audioStart(): Promise<DeviceResult> {
      const startedAt = Date.now()
      const requestId = createRequestId()
      console.info("[devices:mock] stackchan.audio.start")
      if (!recording) {
        recording = true
        timer = setInterval(() => {
          seq += 1
          const chunk: AudioChunk = {
            requestId,
            mimeType: "audio/pcm",
            audioBase64: MOCK_AUDIO_CHUNK_BASE64,
            seq,
            receivedAt: Date.now(),
          }
          for (const handler of audioHandlers) handler(chunk)
          emitEvent({
            type: "audio.chunk",
            request_id: requestId,
            data: {
              mime_type: chunk.mimeType,
              audio_base64: chunk.audioBase64,
              seq: chunk.seq,
            },
          })
        }, MOCK_AUDIO_CHUNK_INTERVAL_MS)
        // Node のプロセスをこのタイマーで生かし続けない
        timer.unref?.()
      }
      return {
        ok: true,
        status: 200,
        data: { requestId },
        latencyMs: Date.now() - startedAt,
      }
    },
    async audioStop(): Promise<DeviceResult> {
      const startedAt = Date.now()
      stopAudioTimer()
      recording = false
      console.info("[devices:mock] stackchan.audio.stop")
      return {
        ok: true,
        status: 200,
        data: { accepted: true },
        latencyMs: Date.now() - startedAt,
      }
    },
    onAudioChunk(handler: (chunk: AudioChunk) => void): () => void {
      audioHandlers.add(handler)
      return () => {
        audioHandlers.delete(handler)
      }
    },
    onEvent(handler: (msg: StackchanInbound) => void): () => void {
      eventHandlers.add(handler)
      return () => {
        eventHandlers.delete(handler)
      }
    },
  }
}
