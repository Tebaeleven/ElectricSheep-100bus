import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "./database.types.js"

export type ServiceClient = SupabaseClient<Database>

/** サーバー専用の Supabase クライアント。secret key が無い環境では null（ログをスキップ） */
export function createServiceClient(env: NodeJS.ProcessEnv): ServiceClient | null {
  const url = env.SUPABASE_URL
  const secretKey = env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) return null

  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false },
  })
}
