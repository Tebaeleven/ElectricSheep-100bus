import { LibSQLStore } from "@mastra/libsql"
import { PostgresStore } from "@mastra/pg"

/**
 * Mastra のストレージ。
 * ローカル Supabase の Postgres があれば `mastra` スキーマに永続化し、
 * 無ければ in-memory の LibSQL にフォールバックする（Docker 不要で動かすため）。
 */
export function createStorage(env: NodeJS.ProcessEnv) {
  const connectionString = env.DATABASE_URL
  if (connectionString) {
    return new PostgresStore({
      id: "mastra-storage",
      connectionString,
      schemaName: "mastra",
    })
  }

  return new LibSQLStore({ id: "mastra-storage", url: ":memory:" })
}
