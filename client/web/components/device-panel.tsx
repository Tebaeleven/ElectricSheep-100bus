"use client"

import { useCallback, useEffect, useState } from "react"
import type {
  AudioChunk,
  DeviceResult,
  ImagePayload,
  RailAxis,
  RailDirection,
} from "@workspace/devices"
import { RAIL_MAX_DURATION_MS } from "@workspace/devices"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"

/** レール移動の既定駆動時間（ミリ秒） */
const DEFAULT_DURATION_MS = 500

/** 首の可動範囲（度）と既定速度。正本は @workspace/devices の headSetSchema */
const HEAD_YAW_MIN = -90
const HEAD_YAW_MAX = 90
const HEAD_PITCH_MIN = -45
const HEAD_PITCH_MAX = 45
const HEAD_SPEED_MAX = 100
const DEFAULT_HEAD_SPEED = 50

/** 首の向きのプリセット（5 ボタン） */
const HEAD_PRESETS: { id: string; label: string; yaw: number; pitch: number }[] =
  [
    { id: "head-left", label: "⬅ 左", yaw: -30, pitch: 0 },
    { id: "head-up", label: "⬆ 上", yaw: 0, pitch: 20 },
    { id: "head-center", label: "⏺ 正面", yaw: 0, pitch: 0 },
    { id: "head-down", label: "⬇ 下", yaw: 0, pitch: -20 },
    { id: "head-right", label: "➡ 右", yaw: 30, pitch: 0 },
  ]

/** レール移動ボタンの並び（軸 × 方向） */
const RAIL_AXES: { axis: RailAxis; label: string }[] = [
  { axis: "x", label: "X 軸" },
  { axis: "y", label: "Y 軸" },
  { axis: "z", label: "Z 軸" },
]

const RAIL_DIRECTIONS: { direction: RailDirection; label: string }[] = [
  { direction: 1, label: "＋" },
  { direction: -1, label: "－" },
]

/** 操作 1 回分の結果表示に必要な情報 */
type ActionOutcome = {
  ok: boolean
  error?: string
  latencyMs?: number
  at: number
}

type AudioRecentResponse = DeviceResult<{ chunks: AudioChunk[] }>
type StackchanStatusResponse = DeviceResult<{
  connected: boolean
  mode: string
}>

/** ok / error / latency を小さく表示する行 */
function OutcomeLine({ outcome }: { outcome: ActionOutcome | undefined }) {
  if (!outcome) return null
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant={outcome.ok ? "default" : "destructive"}>
        {outcome.ok ? "ok" : "error"}
      </Badge>
      {typeof outcome.latencyMs === "number" ? (
        <span className="font-mono">{outcome.latencyMs} ms</span>
      ) : null}
      {outcome.error ? (
        <span className="text-destructive">{outcome.error}</span>
      ) : null}
    </p>
  )
}

/** 機器 API を呼んで DeviceResult を返す（通信例外も DeviceResult に畳む） */
async function callDevice<T>(
  path: string,
  init?: RequestInit
): Promise<DeviceResult<T>> {
  try {
    const response = await fetch(path, init)
    const body = (await response.json()) as DeviceResult<T>
    return body
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
      latencyMs: 0,
    }
  }
}

export function DevicePanel() {
  // 操作 ID ごとの実行結果と実行中フラグ
  const [outcomes, setOutcomes] = useState<Record<string, ActionOutcome>>({})
  const [pending, setPending] = useState<string | null>(null)

  const [durationMs, setDurationMs] = useState(DEFAULT_DURATION_MS)
  const [railStatus, setRailStatus] = useState<unknown>(null)

  const [headYaw, setHeadYaw] = useState(0)
  const [headPitch, setHeadPitch] = useState(0)
  const [headSpeed, setHeadSpeed] = useState(DEFAULT_HEAD_SPEED)

  const [cameraImage, setCameraImage] = useState<ImagePayload | null>(null)
  const [audioCount, setAudioCount] = useState(0)
  const [recording, setRecording] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [mode, setMode] = useState<string | null>(null)

  const [screenshot, setScreenshot] = useState<ImagePayload | null>(null)
  const [url, setUrl] = useState("https://example.com")
  const [desktopStatus, setDesktopStatus] = useState<unknown>(null)

  /** 実行中表示と結果表示をまとめて面倒見るラッパー */
  const run = useCallback(
    async <T,>(
      id: string,
      action: () => Promise<DeviceResult<T>>,
      onSuccess?: (data: T | undefined) => void
    ) => {
      setPending(id)
      const result = await action()
      setOutcomes((prev) => ({
        ...prev,
        [id]: {
          ok: result.ok,
          error: result.error,
          latencyMs: result.latencyMs,
          at: Date.now(),
        },
      }))
      if (result.ok) onSuccess?.(result.data)
      setPending(null)
      return result
    },
    []
  )

  const refreshStackchanStatus = useCallback(async () => {
    const result = await callDevice<{ connected: boolean; mode: string }>(
      "/api/devices/stackchan/status"
    )
    const body = result as StackchanStatusResponse
    if (!body.ok || !body.data) return
    setConnected(body.data.connected)
    setMode(body.data.mode)
  }, [])

  const refreshAudio = useCallback(async () => {
    const body = (await callDevice<{ chunks: AudioChunk[] }>(
      "/api/devices/stackchan/audio/recent?limit=200"
    )) as AudioRecentResponse
    if (!body.ok || !body.data) return
    setAudioCount(body.data.chunks.length)
  }, [])

  // 初回マウント直後に接続状態を取り込む（effect 本体では setState しない）
  useEffect(() => {
    const timer = setTimeout(() => void refreshStackchanStatus(), 0)
    return () => clearTimeout(timer)
  }, [refreshStackchanStatus])

  // 録音中は定期的にチャンク数を更新する
  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => void refreshAudio(), 1000)
    return () => clearInterval(timer)
  }, [recording, refreshAudio])

  const post = (path: string, body?: unknown) =>
    callDevice(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  /** 首を指定角度へ向ける（速度は入力欄の値を使う） */
  const sendHead = (yaw: number, pitch: number) =>
    post("/api/devices/stackchan/head", { yaw, pitch, speed: headSpeed })

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* --- レール（ESP32） ------------------------------------------- */}
      <Card className="border-primary/30 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            🛤 レール
          </CardTitle>
          <CardDescription>軸と方向を選んで移動します</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {RAIL_AXES.map((axisItem) => (
              <div key={axisItem.axis} className="flex items-center gap-2">
                <span className="w-12 text-xs text-muted-foreground">
                  {axisItem.label}
                </span>
                {RAIL_DIRECTIONS.map((directionItem) => {
                  const id = `rail-${axisItem.axis}${directionItem.direction}`
                  return (
                    <Button
                      key={id}
                      size="sm"
                      variant="outline"
                      disabled={pending !== null}
                      onClick={() =>
                        void run(id, () =>
                          post("/api/devices/rail/move", {
                            axis: axisItem.axis,
                            direction: directionItem.direction,
                            durationMs,
                          })
                        )
                      }
                    >
                      {directionItem.label}
                    </Button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="rail-duration"
              className="text-xs text-muted-foreground"
            >
              駆動時間 ms（上限 {RAIL_MAX_DURATION_MS}）
            </label>
            <Input
              id="rail-duration"
              type="number"
              min={1}
              max={RAIL_MAX_DURATION_MS}
              value={durationMs}
              onChange={(event) => setDurationMs(Number(event.target.value))}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending !== null}
              onClick={() =>
                void run("rail-stop", () => post("/api/devices/rail/stop"))
              }
            >
              ⏹ 停止
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending !== null}
              onClick={() =>
                void run(
                  "rail-status",
                  () => callDevice("/api/devices/rail/status"),
                  (data) => setRailStatus(data ?? null)
                )
              }
            >
              📡 状態を更新
            </Button>
          </div>

          <OutcomeLine
            outcome={
              outcomes[
                Object.keys(outcomes)
                  .filter((key) => key.startsWith("rail-"))
                  .sort((a, b) => outcomes[b]!.at - outcomes[a]!.at)[0] ?? ""
              ]
            }
          />

          {railStatus ? (
            <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
              {JSON.stringify(railStatus, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      {/* --- スタックちゃん（WebSocket） ------------------------------- */}
      <Card className="border-primary/30 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            🤖 スタックちゃん
          </CardTitle>
          <CardDescription>首・カメラ・音声を操作します</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={connected ? "default" : "outline"}>
              {connected === null
                ? "接続状態 不明"
                : connected
                  ? "接続済み"
                  : "未接続"}
            </Badge>
            {mode ? <Badge variant="outline">mode {mode}</Badge> : null}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">
              首の向き（yaw {HEAD_YAW_MIN}〜{HEAD_YAW_MAX} / pitch{" "}
              {HEAD_PITCH_MIN}〜{HEAD_PITCH_MAX} 度）
            </span>
            <div className="flex flex-wrap gap-2">
              {HEAD_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant="outline"
                  disabled={pending !== null}
                  onClick={() => {
                    setHeadYaw(preset.yaw)
                    setHeadPitch(preset.pitch)
                    void run(preset.id, () => sendHead(preset.yaw, preset.pitch))
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="head-yaw"
                  className="text-xs text-muted-foreground"
                >
                  yaw（左右）
                </label>
                <Input
                  id="head-yaw"
                  type="number"
                  min={HEAD_YAW_MIN}
                  max={HEAD_YAW_MAX}
                  value={headYaw}
                  onChange={(event) => setHeadYaw(Number(event.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="head-pitch"
                  className="text-xs text-muted-foreground"
                >
                  pitch（上下）
                </label>
                <Input
                  id="head-pitch"
                  type="number"
                  min={HEAD_PITCH_MIN}
                  max={HEAD_PITCH_MAX}
                  value={headPitch}
                  onChange={(event) => setHeadPitch(Number(event.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="head-speed"
                  className="text-xs text-muted-foreground"
                >
                  speed（0〜{HEAD_SPEED_MAX}）
                </label>
                <Input
                  id="head-speed"
                  type="number"
                  min={0}
                  max={HEAD_SPEED_MAX}
                  value={headSpeed}
                  onChange={(event) => setHeadSpeed(Number(event.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending !== null}
              onClick={() =>
                void run("head-set", () => sendHead(headYaw, headPitch))
              }
            >
              🙂 この角度へ向ける
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending !== null}
              onClick={() =>
                void run(
                  "camera",
                  () =>
                    post("/api/devices/stackchan/camera") as Promise<
                      DeviceResult<ImagePayload>
                    >,
                  (data) => setCameraImage(data ?? null)
                ).then(refreshStackchanStatus)
              }
            >
              📷 撮影
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending !== null || recording}
              onClick={() =>
                void run("audio-start", () =>
                  post("/api/devices/stackchan/audio/start")
                ).then((result) => {
                  if (result.ok) setRecording(true)
                  return refreshStackchanStatus()
                })
              }
            >
              ⏺ 録音開始
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending !== null || !recording}
              onClick={() =>
                void run("audio-stop", () =>
                  post("/api/devices/stackchan/audio/stop")
                ).then((result) => {
                  if (result.ok) setRecording(false)
                  return refreshAudio()
                })
              }
            >
              ⏹ 録音停止
            </Button>
            <Badge variant="outline" className="font-mono">
              chunks {audioCount}
            </Badge>
          </div>

          <OutcomeLine
            outcome={
              outcomes[
                Object.keys(outcomes)
                  .filter(
                    (key) =>
                      key.startsWith("head-") ||
                      key.startsWith("audio-") ||
                      key === "camera"
                  )
                  .sort((a, b) => outcomes[b]!.at - outcomes[a]!.at)[0] ?? ""
              ]
            }
          />

          {cameraImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:${cameraImage.mimeType};base64,${cameraImage.imageBase64}`}
              alt="スタックちゃんのカメラ画像"
              className="max-h-40 w-full rounded-md border border-border object-contain"
            />
          ) : null}
        </CardContent>
      </Card>

      {/* --- デスクトップ（Electron） --------------------------------- */}
      <Card className="border-primary/30 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            🖥 デスクトップ
          </CardTitle>
          <CardDescription>画面取得とブラウザ操作</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending !== null}
              onClick={() =>
                void run(
                  "screenshot",
                  () =>
                    post("/api/devices/desktop/screenshot") as Promise<
                      DeviceResult<ImagePayload>
                    >,
                  (data) => setScreenshot(data ?? null)
                )
              }
            >
              🖼 スクリーンショット
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending !== null}
              onClick={() =>
                void run(
                  "desktop-status",
                  () => callDevice("/api/devices/desktop/status"),
                  (data) => setDesktopStatus(data ?? null)
                )
              }
            >
              📡 状態を更新
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="desktop-url" className="text-xs text-muted-foreground">
              開く URL（http / https のみ）
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="desktop-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
              />
              <Button
                size="sm"
                disabled={pending !== null}
                onClick={() =>
                  void run("browser-open", () =>
                    post("/api/devices/desktop/browser/open", { url })
                  )
                }
              >
                開く
              </Button>
            </div>
          </div>

          <OutcomeLine
            outcome={
              outcomes[
                ["screenshot", "desktop-status", "browser-open"]
                  .filter((key) => outcomes[key])
                  .sort((a, b) => outcomes[b]!.at - outcomes[a]!.at)[0] ?? ""
              ]
            }
          />

          {screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:${screenshot.mimeType};base64,${screenshot.imageBase64}`}
              alt="デスクトップのスクリーンショット"
              className="max-h-40 w-full rounded-md border border-border object-contain"
            />
          ) : null}

          {desktopStatus ? (
            <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
              {JSON.stringify(desktopStatus, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
