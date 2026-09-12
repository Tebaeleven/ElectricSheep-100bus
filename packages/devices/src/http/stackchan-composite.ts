import type {
  AudioChunk,
  DeviceResult,
  HandState,
  HeadSet,
  ImagePayload,
  StackchanClient,
  StackchanInbound,
} from "../types"
import type { StackchanBridgeClient } from "./stackchan-bridge"
import type { StackchanHttpClient } from "./stackchan-http"

/** 合成クライアントの `getStatus` が返す状態（二本立ての両方をまとめる） */
export interface StackchanCompositeStatus {
  /** 機器上の HTTP（8765）。health が通れば reachable */
  http?: { reachable: boolean; error?: string }
  /** PC 側ブリッジ（8030）の `GET /obake/status` */
  bridge?: Record<string, unknown>
}

/** 合成クライアント。`getStatus` で HTTP とブリッジの両方の状態を返す */
export interface StackchanCompositeClient extends StackchanClient {
  getStatus(
    signal?: AbortSignal
  ): Promise<DeviceResult<StackchanCompositeStatus>>
}

export interface StackchanCompositeOptions {
  /** 機器上の HTTP（8765）。手と LED を担当する */
  http?: StackchanHttpClient
  /** PC 側ブリッジ（8030）。首・カメラ・音声を担当する */
  bridge?: StackchanBridgeClient
  /** どちらも無い機能のための受け皿（通常はモッククライアント） */
  fallback: StackchanClient
}

/**
 * スタックちゃんの二本立てを 1 つの `StackchanClient` にまとめる。
 *
 * - 手（`handSet`）・LED（`ledSet`）→ 機器上の HTTP（8765）。無ければ fallback
 * - 首・カメラ・音声・イベント → PC 側ブリッジ（8030）。無ければ fallback
 *
 * 機器の HTTP サーバーには首・カメラ・音声が無く、ブリッジには手・LED が無いので、
 * 1 台のロボットを操作するにはこの振り分けが要る
 */
export function createStackchanCompositeClient(
  options: StackchanCompositeOptions
): StackchanCompositeClient {
  const { http, bridge, fallback } = options
  /** 首・カメラ・音声を担当するクライアント */
  const media: StackchanClient = bridge ?? fallback

  return {
    get connected() {
      return media.connected
    },

    async connect(): Promise<void> {
      await media.connect()
    },

    async close(): Promise<void> {
      await media.close()
    },

    async getStatus(
      signal?: AbortSignal
    ): Promise<DeviceResult<StackchanCompositeStatus>> {
      const startedAt = Date.now()
      const [httpResult, bridgeResult] = await Promise.all([
        http ? http.health(signal) : Promise.resolve(undefined),
        bridge ? bridge.getStatus(signal) : Promise.resolve(undefined),
      ])
      const data: StackchanCompositeStatus = {}
      if (httpResult) {
        data.http = {
          reachable: httpResult.ok && httpResult.data?.ok === true,
          error: httpResult.error,
        }
      }
      if (bridgeResult?.data) data.bridge = { ...bridgeResult.data }

      return {
        ok: (httpResult?.ok ?? false) || (bridgeResult?.ok ?? false),
        data,
        error: bridgeResult?.error ?? httpResult?.error,
        latencyMs: Date.now() - startedAt,
      }
    },

    headSet(input: HeadSet, opts?: { timeoutMs?: number }) {
      return media.headSet(input, opts)
    },

    handSet(state: HandState, opts?: { timeoutMs?: number }) {
      // 機器上の HTTP が唯一の手の動かし方。opts.timeoutMs は HTTP 側では使わない
      void opts
      return http ? http.handSet(state) : fallback.handSet(state, opts)
    },

    ledSet(on: boolean, opts?: { timeoutMs?: number }) {
      void opts
      return http ? http.ledSet(on) : fallback.ledSet(on, opts)
    },

    cameraCapture(opts?: {
      timeoutMs?: number
    }): Promise<DeviceResult<ImagePayload>> {
      return media.cameraCapture(opts)
    },

    audioStart() {
      return media.audioStart()
    },

    audioStop() {
      return media.audioStop()
    },

    onAudioChunk(handler: (chunk: AudioChunk) => void): () => void {
      return media.onAudioChunk(handler)
    },

    onEvent(handler: (msg: StackchanInbound) => void): () => void {
      return media.onEvent(handler)
    },
  }
}
