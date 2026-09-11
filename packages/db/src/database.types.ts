/**
 * Supabase の生成型スケルトン。
 * A レーンが `pnpm db:types` で生成した内容に置き換える。
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      robot_commands: {
        Row: {
          id: string
          thread_id: string | null
          command: Json
          status: string | null
          result: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          thread_id?: string | null
          command: Json
          status?: string | null
          result?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string | null
          command?: Json
          status?: string | null
          result?: Json | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
