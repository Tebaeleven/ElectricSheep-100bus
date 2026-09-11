"use client"

import { HistoryIcon, RotateCcwIcon, PlayIcon, Trash2Icon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { findEndpoint } from "@/lib/dev/endpoints"
import { buildCurl } from "@/lib/dev/curl"
import type { DevHistoryEntry } from "@/lib/dev/history"
import { CopyButton } from "./copy-button"
import { MethodBadge } from "./method-badge"

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString("ja-JP", { hour12: false })
}

export function HistoryPanel({
  entries,
  onRestore,
  onRerun,
  onClear,
}: {
  entries: DevHistoryEntry[]
  onRestore: (entry: DevHistoryEntry) => void
  onRerun: (entry: DevHistoryEntry) => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <HistoryIcon className="size-4" />
          履歴（直近 {entries.length} 件）
        </h2>
        <Button variant="ghost" size="xs" onClick={onClear}>
          <Trash2Icon />
          クリア
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-xs">まだ実行していません。</p>
      ) : (
        <ScrollArea className="max-h-72">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">時刻</TableHead>
                <TableHead>エンドポイント</TableHead>
                <TableHead className="w-16">status</TableHead>
                <TableHead className="w-20">latency</TableHead>
                <TableHead className="w-56">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const endpoint = findEndpoint(entry.endpointId)
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">
                      {formatTime(entry.at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MethodBadge method={entry.method} />
                        <span className="font-mono text-xs break-all">
                          {entry.path}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.status ?? "ERR"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.latencyMs} ms
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => onRestore(entry)}
                        >
                          <RotateCcwIcon />
                          入力復元
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => onRerun(entry)}
                        >
                          <PlayIcon />
                          再実行
                        </Button>
                        {endpoint ? (
                          <CopyButton
                            label="curl"
                            value={() => buildCurl(endpoint, entry.input)}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </div>
  )
}
