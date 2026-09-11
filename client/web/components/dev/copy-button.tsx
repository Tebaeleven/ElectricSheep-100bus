"use client"

import * as React from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

/** コピー完了表示を戻すまでの時間（ms） */
const COPIED_RESET_MS = 1500

export function CopyButton({
  value,
  label = "コピー",
  size = "xs",
}: {
  value: string | (() => string)
  label?: string
  size?: "xs" | "sm" | "default"
}) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <Button
      variant="outline"
      size={size}
      onClick={() => {
        const text = typeof value === "function" ? value() : value
        void navigator.clipboard
          ?.writeText(text)
          .then(() => setCopied(true))
          .catch(() => setCopied(false))
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "コピーしました" : label}
    </Button>
  )
}
