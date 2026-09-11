import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Mastra は Node ネイティブ依存を持つためバンドルせず外部化する
  serverExternalPackages: ["@mastra/*"],
  transpilePackages: [
    "@workspace/ui",
    "@workspace/agent",
    "@workspace/robot",
    "@workspace/db",
  ],
}

export default nextConfig
