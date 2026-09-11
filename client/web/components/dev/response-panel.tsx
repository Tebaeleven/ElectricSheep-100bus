"use client"

import { AlertTriangleIcon, LoaderCircleIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"

import type { DevRunResult } from "@/lib/dev/run"
import { CopyButton } from "./copy-button"
import { JsonTree } from "./json-tree"

function StatusBadge({ result }: { result: DevRunResult }) {
  if (result.status === null) {
    return <Badge variant="destructive">接続不可</Badge>
  }
  if (result.notImplemented) {
    return <Badge variant="destructive">404 未実装 / 未マージ</Badge>
  }
  return (
    <Badge variant={result.ok ? "default" : "destructive"} className="font-mono">
      {result.status} {result.statusText}
    </Badge>
  )
}

export function ResponsePanel({
  result,
  running,
  streamText,
}: {
  result: DevRunResult | null
  running: boolean
  streamText: string
}) {
  const rawJson =
    result?.json !== undefined ? JSON.stringify(result.json, null, 2) : null

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">レスポンス</h2>
        {running ? (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <LoaderCircleIcon className="size-3 animate-spin" />
            実行中
          </span>
        ) : null}
        {result ? <StatusBadge result={result} /> : null}
        {result ? (
          <span className="text-muted-foreground font-mono text-xs">
            {result.latencyMs} ms
          </span>
        ) : null}
        {rawJson ? <CopyButton value={rawJson} label="JSON をコピー" /> : null}
      </div>

      <Separator />

      {!result && !running ? (
        <p className="text-muted-foreground text-sm">
          左のエンドポイントを選んで実行してください。
        </p>
      ) : null}

      {result?.notImplemented ? (
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
          このルートはまだ実装されていない（または別レーンが未マージ）可能性があります。
        </p>
      ) : null}

      {result?.error ? (
        <p className="text-destructive font-mono text-xs break-all">
          {result.error}
        </p>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 pr-3">
          {result?.image ? (
            <figure className="flex flex-col gap-2">
              {/* base64 の生データを表示するだけなので next/image は使わない */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:${result.image.mimeType};base64,${result.image.base64}`}
                alt="機器から取得した画像"
                className="border-border max-w-full rounded-lg border"
              />
              <figcaption className="text-muted-foreground font-mono text-xs">
                {result.image.mimeType} / {result.image.base64.length} chars
              </figcaption>
            </figure>
          ) : null}

          {result?.kind === "image" && result.json && !result.image ? (
            <p className="text-muted-foreground text-xs">
              画像フィールド（imageBase64 / image_base64）が見つかりませんでした。
            </p>
          ) : null}

          {result?.kind === "stream" || streamText ? (
            <pre className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
              {streamText || result?.text || "(空)"}
            </pre>
          ) : null}

          {result?.json !== undefined ? <JsonTree value={result.json} /> : null}

          {result?.json === undefined &&
          result?.text &&
          result.kind !== "stream" ? (
            <pre className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
              {result.text}
            </pre>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
