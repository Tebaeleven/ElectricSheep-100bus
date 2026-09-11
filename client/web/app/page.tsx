import Link from "next/link"

import { DevicePanel } from "@/components/device-panel"
import { GhostChat } from "@/components/ghost-chat"

export default function Page() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl justify-end px-4 pt-4">
        <Link
          href="/dev"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          🛠 開発者ダッシュボード
        </Link>
      </div>
      <GhostChat />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-8">
        <h2 className="text-sm font-semibold text-muted-foreground">
          機器の手動操作
        </h2>
        <DevicePanel />
      </div>
    </div>
  )
}
