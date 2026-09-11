"use client"

import * as React from "react"

import { DevHeader } from "@/components/dev/dev-header"
import { EndpointList } from "@/components/dev/endpoint-list"
import { HistoryPanel } from "@/components/dev/history-panel"
import { RequestPanel } from "@/components/dev/request-panel"
import { ResponsePanel } from "@/components/dev/response-panel"
import {
  DEV_ENDPOINTS,
  findEndpoint,
  type DevEndpoint,
  type DevInput,
} from "@/lib/dev/endpoints"
import {
  clearHistory,
  getHistorySnapshot,
  getHistoryServerSnapshot,
  newHistoryId,
  pushHistory,
  subscribeHistory,
  type DevHistoryEntry,
} from "@/lib/dev/history"
import { runEndpoint, type DevRunResult } from "@/lib/dev/run"

const FIRST_ENDPOINT = DEV_ENDPOINTS[0] as DevEndpoint

export default function DevPage() {
  const [endpoint, setEndpoint] = React.useState<DevEndpoint>(FIRST_ENDPOINT)
  const [input, setInput] = React.useState<DevInput>({
    ...FIRST_ENDPOINT.defaultInput,
  })
  const [result, setResult] = React.useState<DevRunResult | null>(null)
  const [streamText, setStreamText] = React.useState("")
  const [running, setRunning] = React.useState(false)
  // 履歴は localStorage という外部ストアなので useSyncExternalStore で購読する
  const history = React.useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot
  )

  const execute = React.useCallback(
    async (target: DevEndpoint, payload: DevInput) => {
      setRunning(true)
      setStreamText("")
      setResult(null)
      const runResult = await runEndpoint(target, payload, {
        onStreamChunk: (accumulated) => setStreamText(accumulated),
      })
      setResult(runResult)
      setRunning(false)
      pushHistory({
        id: newHistoryId(),
        endpointId: target.id,
        method: target.method,
        path: target.path,
        input: payload,
        status: runResult.status,
        latencyMs: runResult.latencyMs,
        ok: runResult.ok,
        at: Date.now(),
      })
    },
    []
  )

  const runCurrent = React.useCallback(() => {
    void execute(endpoint, input)
  }, [execute, endpoint, input])

  // ⌘/Ctrl + Enter で実行
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        runCurrent()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [runCurrent])

  const selectEndpoint = React.useCallback((next: DevEndpoint) => {
    setEndpoint(next)
    setInput({ ...next.defaultInput })
    setResult(null)
    setStreamText("")
  }, [])

  const restoreEntry = React.useCallback((entry: DevHistoryEntry) => {
    const target = findEndpoint(entry.endpointId)
    if (!target) return
    setEndpoint(target)
    setInput({ ...entry.input })
    setResult(null)
    setStreamText("")
  }, [])

  const rerunEntry = React.useCallback(
    (entry: DevHistoryEntry) => {
      const target = findEndpoint(entry.endpointId)
      if (!target) return
      setEndpoint(target)
      setInput({ ...entry.input })
      void execute(target, entry.input)
    },
    [execute]
  )

  return (
    <div className="flex min-h-svh flex-col">
      <DevHeader />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]">
        <aside className="border-border lg:border-r lg:max-h-[calc(100svh-6rem)]">
          <EndpointList selectedId={endpoint.id} onSelect={selectEndpoint} />
        </aside>
        <section className="border-border border-t lg:border-t-0 lg:border-r">
          <RequestPanel
            endpoint={endpoint}
            input={input}
            onInputChange={setInput}
            onRun={runCurrent}
            running={running}
          />
        </section>
        <section className="border-border border-t lg:border-t-0">
          <ResponsePanel
            result={result}
            running={running}
            streamText={streamText}
          />
        </section>
      </div>
      <div className="border-border border-t">
        <HistoryPanel
          entries={history}
          onRestore={restoreEntry}
          onRerun={rerunEntry}
          onClear={clearHistory}
        />
      </div>
    </div>
  )
}
