"use client"

import { useState } from "react"
import type { RobotCommand, RobotResult } from "@workspace/robot"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

/** 感情ボタンの並び（絵文字はおばけの表情） */
const EMOTIONS: {
  emotion: "happy" | "sad" | "surprised" | "neutral"
  label: string
}[] = [
  { emotion: "happy", label: "😊 うれしい" },
  { emotion: "sad", label: "😢 かなしい" },
  { emotion: "surprised", label: "😲 びっくり" },
  { emotion: "neutral", label: "😐 ふつう" },
]

/** 移動ボタンの並び */
const MOVES: {
  direction: "up" | "down" | "left" | "right" | "forward" | "back"
  label: string
}[] = [
  { direction: "up", label: "↑ 上" },
  { direction: "down", label: "↓ 下" },
  { direction: "left", label: "← 左" },
  { direction: "right", label: "→ 右" },
  { direction: "forward", label: "⤴ 前" },
  { direction: "back", label: "⤵ 後" },
]

const MOVE_DURATION_MS = 800

export function RobotPanel() {
  const [result, setResult] = useState<RobotResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function call(request: () => Promise<Response>) {
    setPending(true)
    setError(null)
    try {
      const response = await request()
      const body = (await response.json()) as RobotResult & { error?: string }
      if (!response.ok) {
        setError(body.error ?? `リクエストに失敗しました（${response.status}）`)
        setResult(null)
        return
      }
      setResult(body)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setResult(null)
    } finally {
      setPending(false)
    }
  }

  const sendCommand = (command: RobotCommand) =>
    call(() =>
      fetch("/api/robot/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      })
    )

  const fetchStatus = () => call(() => fetch("/api/robot/status"))

  return (
    <Card className="border-primary/30 bg-card/60 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          🎛️ ロボット手動操作
        </CardTitle>
        <CardDescription>
          おばけに直接コマンドを送ります（サーバー経由）
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">表情</p>
          <div className="flex flex-wrap gap-2">
            {EMOTIONS.map((item) => (
              <Button
                key={item.emotion}
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  sendCommand({ type: "emote", emotion: item.emotion })
                }
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">移動</p>
          <div className="flex flex-wrap gap-2">
            {MOVES.map((item) => (
              <Button
                key={item.direction}
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  sendCommand({
                    type: "move",
                    direction: item.direction,
                    durationMs: MOVE_DURATION_MS,
                  })
                }
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => sendCommand({ type: "stop" })}
          >
            ⏹ 停止
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={fetchStatus}
          >
            📡 状態を取得
          </Button>
        </div>

        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={result.ok ? "default" : "destructive"}>
                {result.ok ? "成功" : "失敗"}
              </Badge>
              <Badge variant="outline">{result.latencyMs} ms</Badge>
              {result.status ? (
                <Badge variant="outline">HTTP {result.status}</Badge>
              ) : null}
            </div>
            <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
              {JSON.stringify(result.error ?? result.body ?? null, null, 2)}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
