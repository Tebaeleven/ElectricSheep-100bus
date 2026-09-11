"use client"

import * as React from "react"
import { LoaderCircleIcon, PlayIcon, WandSparklesIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"

import type { DevEndpoint, DevInput } from "@/lib/dev/endpoints"
import { AutoForm, buildFields, validateInput } from "@/lib/dev/form-from-schema"
import { buildCurl } from "@/lib/dev/curl"
import { buildRequestBody } from "@/lib/dev/run"
import { CopyButton } from "./copy-button"
import { MethodBadge } from "./method-badge"

type TabValue = "form" | "json"

/** JSON 文字列のパースエラーから行番号を推定する */
function jsonErrorMessage(text: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const match = /position (\d+)/.exec(message)
  if (!match) return message
  const position = Number(match[1])
  const line = text.slice(0, position).split("\n").length
  return `${line} 行目: ${message}`
}

export function RequestPanel({
  endpoint,
  input,
  onInputChange,
  onRun,
  running,
}: {
  endpoint: DevEndpoint
  input: DevInput
  onInputChange: (next: DevInput) => void
  onRun: () => void
  running: boolean
}) {
  const [tab, setTab] = React.useState<TabValue>("form")
  const [jsonText, setJsonText] = React.useState(() =>
    JSON.stringify(input, null, 2)
  )
  const [jsonError, setJsonError] = React.useState<string | null>(null)
  // JSON タブ由来の変更で textarea を再整形しないためのフラグ
  const fromJsonTabRef = React.useRef(false)

  // フォーム側やプリセットで入力が変わったら JSON タブへ反映する
  React.useEffect(() => {
    if (fromJsonTabRef.current) {
      fromJsonTabRef.current = false
      return
    }
    setJsonText(JSON.stringify(input, null, 2))
    setJsonError(null)
  }, [input])

  const fields = React.useMemo(
    () => buildFields(endpoint.inputSchema),
    [endpoint.inputSchema]
  )
  const validationErrors = React.useMemo(
    () => validateInput(endpoint.inputSchema, input),
    [endpoint.inputSchema, input]
  )

  const requestBody = React.useMemo(() => {
    try {
      return JSON.stringify(buildRequestBody(endpoint, input), null, 2)
    } catch {
      return "(変換できませんでした)"
    }
  }, [endpoint, input])

  const applyJson = (text: string) => {
    setJsonText(text)
    if (text.trim() === "") {
      setJsonError(null)
      fromJsonTabRef.current = true
      onInputChange({})
      return
    }
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("オブジェクト（{...}）を入力してください")
        return
      }
      setJsonError(null)
      fromJsonTabRef.current = true
      onInputChange(parsed as DevInput)
    } catch (error) {
      setJsonError(jsonErrorMessage(text, error))
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge method={endpoint.method} />
          <code className="font-mono text-sm break-all">{endpoint.path}</code>
        </div>
        <p className="text-muted-foreground text-xs">{endpoint.description}</p>
      </div>

      {endpoint.presets && endpoint.presets.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <WandSparklesIcon className="size-3" />
            プリセット
          </span>
          <div className="flex flex-wrap gap-2">
            {endpoint.presets.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                onClick={() => onInputChange({ ...preset.input })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <Separator />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabValue)}
        className="min-h-0 flex-1"
      >
        <TabsList>
          <TabsTrigger value="form">フォーム</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="form" className="overflow-y-auto pt-2">
          <AutoForm fields={fields} value={input} onChange={onInputChange} />
        </TabsContent>
        <TabsContent value="json" className="flex flex-col gap-2 pt-2">
          <Textarea
            className="min-h-48 font-mono text-xs"
            spellCheck={false}
            value={jsonText}
            onChange={(event) => applyJson(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setJsonText(JSON.stringify(input, null, 2))
                setJsonError(null)
              }}
            >
              整形
            </Button>
            {jsonError ? (
              <span className="text-destructive text-xs">{jsonError}</span>
            ) : (
              <span className="text-muted-foreground text-xs">JSON OK</span>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {validationErrors.length > 0 ? (
        <ul className="text-destructive flex flex-col gap-1 text-xs">
          {validationErrors.map((message) => (
            <li key={message} className="font-mono">
              {message}
            </li>
          ))}
        </ul>
      ) : null}

      <Separator />

      <details className="text-muted-foreground text-xs">
        <summary className="cursor-pointer">送信されるボディを見る</summary>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-lg p-2 font-mono text-xs">
          {endpoint.method === "GET" ? "(GET のためボディなし)" : requestBody}
        </pre>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" disabled={running} onClick={onRun}>
          {running ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <PlayIcon />
          )}
          実行（⌘/Ctrl + Enter）
        </Button>
        <CopyButton
          size="sm"
          label="curl をコピー"
          value={() => buildCurl(endpoint, input)}
        />
      </div>
    </div>
  )
}
