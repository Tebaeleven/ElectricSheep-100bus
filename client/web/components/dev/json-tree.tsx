"use client"

import * as React from "react"
import { ChevronRightIcon, ChevronDownIcon } from "lucide-react"

/** 既定で開いておく深さ */
const DEFAULT_OPEN_DEPTH = 2
/** 文字列値の折り返し表示上限 */
const STRING_PREVIEW_LIMIT = 300

type JsonValue = unknown

function typeLabel(value: JsonValue): string {
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value === null) return "null"
  if (typeof value === "object") {
    return `Object(${Object.keys(value as Record<string, unknown>).length})`
  }
  return typeof value
}

function ScalarValue({ value }: { value: JsonValue }) {
  if (typeof value === "string") {
    const preview =
      value.length > STRING_PREVIEW_LIMIT
        ? `${value.slice(0, STRING_PREVIEW_LIMIT)}…(${value.length} 文字)`
        : value
    return <span className="text-primary break-all">&quot;{preview}&quot;</span>
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-foreground">{String(value)}</span>
  }
  return <span className="text-muted-foreground">{String(value)}</span>
}

function JsonNode({
  name,
  value,
  depth,
}: {
  name?: string
  value: JsonValue
  depth: number
}) {
  const isBranch =
    value !== null && typeof value === "object" && !(value instanceof Date)
  const [open, setOpen] = React.useState(depth < DEFAULT_OPEN_DEPTH)

  if (!isBranch) {
    return (
      <div className="flex gap-2 font-mono text-xs">
        {name !== undefined ? (
          <span className="text-muted-foreground shrink-0">{name}:</span>
        ) : null}
        <ScalarValue value={value} />
      </div>
    )
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>)

  return (
    <div className="flex flex-col font-mono text-xs">
      <button
        type="button"
        className="hover:bg-accent flex items-center gap-1 rounded px-1 py-0.5 text-left"
        onClick={() => setOpen((previous) => !previous)}
      >
        {open ? (
          <ChevronDownIcon className="size-3 shrink-0" />
        ) : (
          <ChevronRightIcon className="size-3 shrink-0" />
        )}
        {name !== undefined ? (
          <span className="text-muted-foreground">{name}:</span>
        ) : null}
        <span className="text-muted-foreground">{typeLabel(value)}</span>
      </button>
      {open ? (
        <div className="border-border ml-2 flex flex-col gap-1 border-l pt-1 pl-3">
          {entries.length === 0 ? (
            <span className="text-muted-foreground">（空）</span>
          ) : (
            entries.map(([key, child]) => (
              <JsonNode key={key} name={key} value={child} depth={depth + 1} />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export function JsonTree({ value }: { value: JsonValue }) {
  return <JsonNode value={value} depth={0} />
}
