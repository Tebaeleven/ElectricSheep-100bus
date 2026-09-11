"use client"

import * as React from "react"
import { OctagonXIcon, RefreshCwIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import {
  EMERGENCY_STOP_STEPS,
  STATUS_POLL_TARGETS,
} from "@/lib/dev/endpoints"
import { probeStatus } from "@/lib/dev/run"

/** 接続状態のポーリング間隔（ms） */
const POLL_INTERVAL_MS = 5000

interface DevEnvResponse {
  deviceMode?: string
  railBaseUrl?: string | null
  desktopBaseUrl?: string | null
  stackchanWsUrl?: string | null
  robotMode?: string | null
  robotBaseUrl?: string | null
  ghostModel?: string | null
  secrets?: Record<string, boolean>
}

type ProbeState = "loading" | "ok" | "ng" | "missing"

function stateBadgeVariant(state: ProbeState) {
  if (state === "ok") return "default" as const
  if (state === "missing") return "outline" as const
  if (state === "ng") return "destructive" as const
  return "secondary" as const
}

function stateLabel(state: ProbeState): string {
  if (state === "ok") return "OK"
  if (state === "missing") return "未実装"
  if (state === "ng") return "NG"
  return "…"
}

export function DevHeader() {
  const [env, setEnv] = React.useState<DevEnvResponse | null>(null)
  const [envMissing, setEnvMissing] = React.useState(false)
  const [statuses, setStatuses] = React.useState<Record<string, ProbeState>>({})
  const [stopping, setStopping] = React.useState(false)
  const [stopLog, setStopLog] = React.useState<string[]>([])

  const refresh = React.useCallback(async () => {
    const envResult = await probeStatus("/api/dev/env")
    if (envResult.status === 404) {
      setEnvMissing(true)
    } else if (envResult.ok) {
      setEnvMissing(false)
      setEnv(envResult.data as DevEnvResponse)
    }

    const entries = await Promise.all(
      STATUS_POLL_TARGETS.map(async (target) => {
        const result = await probeStatus(target.path)
        const state: ProbeState =
          result.status === 404 ? "missing" : result.ok ? "ok" : "ng"
        return [target.id, state] as const
      })
    )
    setStatuses(Object.fromEntries(entries))
  }, [])

  React.useEffect(() => {
    let cancelled = false
    const tick = () => {
      if (!cancelled) void refresh()
    }
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [refresh])

  const emergencyStop = React.useCallback(async () => {
    setStopping(true)
    const log: string[] = []
    for (const step of EMERGENCY_STOP_STEPS) {
      try {
        const response = await fetch(step.path, {
          method: step.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(step.body ?? {}),
        })
        log.push(`${step.label}: ${response.status}`)
      } catch (error) {
        log.push(
          `${step.label}: ${error instanceof Error ? error.message : "失敗"}`
        )
      }
    }
    setStopLog(log)
    setStopping(false)
  }, [])

  return (
    <header className="bg-background/95 border-border sticky top-0 z-40 flex flex-col gap-2 border-b p-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold">開発者ダッシュボード /dev</h1>
        <Badge variant="secondary" className="font-mono">
          DEVICE_MODE={env?.deviceMode ?? "?"}
        </Badge>
        {env?.robotMode ? (
          <Badge variant="secondary" className="font-mono">
            ROBOT_MODE={env.robotMode}
          </Badge>
        ) : null}
        {envMissing ? (
          <Badge variant="destructive">/api/dev/env 未実装</Badge>
        ) : null}

        <Separator orientation="vertical" className="mx-1 h-5" />

        <TooltipProvider>
          {STATUS_POLL_TARGETS.map((target) => (
            <Tooltip key={target.id}>
              <TooltipTrigger
                render={
                  <Badge
                    variant={stateBadgeVariant(statuses[target.id] ?? "loading")}
                  >
                    {target.label}: {stateLabel(statuses[target.id] ?? "loading")}
                  </Badge>
                }
              />
              <TooltipContent>
                <span className="font-mono text-xs">GET {target.path}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCwIcon />
            更新
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={stopping}
            onClick={() => void emergencyStop()}
          >
            <OctagonXIcon />
            緊急停止
          </Button>
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
        <span>RAIL={env?.railBaseUrl ?? "-"}</span>
        <span>DESKTOP={env?.desktopBaseUrl ?? "-"}</span>
        <span>STACKCHAN={env?.stackchanWsUrl ?? "-"}</span>
        <span>GHOST_MODEL={env?.ghostModel ?? "-"}</span>
        {env?.secrets
          ? Object.entries(env.secrets).map(([key, configured]) => (
              <span key={key}>
                {key}={configured ? "設定済み" : "未設定"}
              </span>
            ))
          : null}
      </div>

      {stopLog.length > 0 ? (
        <div className="text-muted-foreground flex flex-wrap gap-3 font-mono text-xs">
          {stopLog.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
    </header>
  )
}
