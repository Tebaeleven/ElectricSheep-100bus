"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

import {
  getGhostSessionServerSnapshot,
  getGhostSessionSnapshot,
  resetGhostThread,
  subscribeGhostSession,
} from "@/lib/session"
import { RobotPanel } from "@/components/robot-panel"

/** Mastra 側で履歴を復元するため、送信するのは最新 1 メッセージだけ */
const SEND_MESSAGE_COUNT = 1

/** ロボット操作系ツールの表示名 */
const TOOL_LABELS: Record<string, string> = {
  "tool-robotCommand": "ロボットを動かしています",
  "tool-robotStatus": "ロボットの状態を確認しています",
}

type ToolPart = {
  type: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
}

function isToolPart(part: { type: string }): part is ToolPart {
  return part.type === "tool-robotCommand" || part.type === "tool-robotStatus"
}

function ToolCallView({ part }: { part: ToolPart }) {
  const label = TOOL_LABELS[part.type] ?? "ツールを実行しています"

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="animate-pulse">👻</span>
        <span>{label}…</span>
      </div>
    )
  }

  if (part.state === "output-error") {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="destructive">{label}: 失敗</Badge>
        <p className="text-xs text-destructive">{part.errorText}</p>
      </div>
    )
  }

  if (part.state === "output-available") {
    const output = part.output as
      | { ok?: boolean; latencyMs?: number }
      | undefined
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={output?.ok === false ? "destructive" : "default"}>
          {label}: {output?.ok === false ? "失敗" : "完了"}
        </Badge>
        {typeof output?.latencyMs === "number" ? (
          <Badge variant="outline">{output.latencyMs} ms</Badge>
        ) : null}
      </div>
    )
  }

  return <Badge variant="outline">{label}</Badge>
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "flex max-w-[80%] flex-col gap-2 rounded-2xl px-4 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-primary/20 bg-muted text-foreground",
        ].join(" ")}
      >
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <p key={index} className="whitespace-pre-wrap">
                {part.text}
              </p>
            )
          }
          if (isToolPart(part)) {
            return <ToolCallView key={index} part={part} />
          }
          return null
        })}
      </div>
    </div>
  )
}

export function GhostChat() {
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  // localStorage はクライアントにしか無いので外部ストアとして購読する
  const session = useSyncExternalStore(
    subscribeGhostSession,
    getGhostSessionSnapshot,
    getGhostSessionServerSnapshot
  )

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => {
          // 送信時点のセッションを読む（render 中ではないので参照しても安全）
          const current = getGhostSessionSnapshot()
          return {
            body: {
              ...body,
              // 履歴は Mastra Memory が復元するので最新分だけ送る
              messages: messages.slice(-SEND_MESSAGE_COUNT),
              memory: current
                ? { thread: current.thread, resource: current.resource }
                : undefined,
            },
          }
        },
      }),
    []
  )

  const { messages, sendMessage, status, error, setMessages, clearError } =
    useChat({
      transport,
    })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const busy = status === "submitted" || status === "streaming"

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput("")
    void sendMessage({ text })
  }

  function handleReset() {
    resetGhostThread()
    setMessages([])
    clearError()
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              👻 おばけロボットとおしゃべり
            </h1>
            <p className="text-sm text-muted-foreground">
              話しかけると、ふわふわ浮かびながら返事をしてくれます。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session ? (
              <Badge variant="outline" className="font-mono text-xs">
                thread {session.thread.slice(0, 8)}
              </Badge>
            ) : null}
            <Button size="sm" variant="ghost" onClick={handleReset}>
              会話をリセット
            </Button>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="flex min-h-[60svh] flex-col border-primary/30 bg-card/60 backdrop-blur">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
              <ScrollArea className="h-[52svh] pr-3">
                <div className="flex flex-col gap-3">
                  {messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      「こんにちは」と話しかけてみてください 👻
                    </p>
                  ) : (
                    messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              {error ? (
                <div
                  className="flex flex-col gap-1 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  role="alert"
                >
                  <span>{error.message}</span>
                  <span className="text-muted-foreground">
                    ANTHROPIC_API_KEY を client/web/.env.local
                    に設定して開発サーバーを再起動してください。
                  </span>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="おばけに話しかける…"
                  aria-label="メッセージ"
                  disabled={busy}
                />
                <Button
                  type="submit"
                  disabled={busy || input.trim().length === 0}
                >
                  {busy ? "…" : "送信"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <RobotPanel />
        </div>
      </div>
    </div>
  )
}
