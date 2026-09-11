import path from "node:path"
import type { NextConfig } from "next"

const workspaceRoot = path.join(import.meta.dirname, "../..")

const nextConfig: NextConfig = {
  // Mastra は Node ネイティブ依存を持つためバンドルせず外部化する
  serverExternalPackages: ["@mastra/*"],
  transpilePackages: [
    "@workspace/ui",
    "@workspace/agent",
    "@workspace/robot",
    "@workspace/db",
  ],
  turbopack: {
    // workspace パッケージの TS ソースを解決させるためモノレポのルートを基準にする
    root: workspaceRoot,
  },
}

export default nextConfig
