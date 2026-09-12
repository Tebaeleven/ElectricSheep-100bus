/**
 * 開発者ダッシュボード用の env 参照。
 * 秘密値そのものは絶対に返さず、キー類は「設定済みかどうか」の真偽値だけを返す。
 */
import { EXPECTED_PORTS } from "@/lib/dev/endpoints"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** 値を持つ env だけを返す（空文字は未設定扱い） */
function publicEnv(name: string): string | null {
  const value = process.env[name]
  return value && value.trim() !== "" ? value : null
}

function isConfigured(name: string): boolean {
  return publicEnv(name) !== null
}

export function GET() {
  return Response.json({
    // 台帳（scripts/ports.json）由来の「期待ポート」。いずれも非秘密
    ports: EXPECTED_PORTS,
    deviceMode: publicEnv("DEVICE_MODE") ?? "mock",
    railBaseUrl: publicEnv("RAIL_BASE_URL"),
    desktopBaseUrl: publicEnv("DESKTOP_BASE_URL"),
    stackchanWsUrl: publicEnv("STACKCHAN_WS_URL"),
    robotMode: publicEnv("ROBOT_MODE") ?? "mock",
    robotBaseUrl: publicEnv("ROBOT_BASE_URL"),
    ghostModel: publicEnv("GHOST_MODEL"),
    secrets: {
      DATABASE_URL: isConfigured("DATABASE_URL"),
      SUPABASE_SECRET_KEY: isConfigured("SUPABASE_SECRET_KEY"),
      GOOGLE_GENERATIVE_AI_API_KEY: isConfigured(
        "GOOGLE_GENERATIVE_AI_API_KEY"
      ),
    },
  })
}
