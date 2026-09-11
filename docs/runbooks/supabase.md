# Runbook: Supabase（ローカル）

Supabase はローカル専用。**Mastra Memory の保存先（`mastra` スキーマ）** と **アプリ固有テーブル（`public.robot_commands`）** の 2 役を担う。CLI はリポジトリの devDependency（`supabase@2.117.0`）を使い、設定は `server/` 配下に置く（`supabase --workdir server`）。

## コマンド

| コマンド | 実体 | 内容 |
|---|---|---|
| `pnpm db:start` | `supabase --workdir server start` | Docker でローカルスタックを起動（API 54321 / DB 54322 / Studio 54323）。初回は pull で数分 |
| `pnpm db:stop` | `supabase --workdir server stop` | 停止。データは保持される |
| `pnpm db:reset` | `supabase --workdir server db reset` | DB を作り直して migrations + seed を当て直す。**データは消える** |
| `pnpm db:status` | `supabase --workdir server status` | URL・anon/secret キーの再表示 |
| `pnpm db:types` | `supabase --workdir server gen types typescript --local > packages/db/src/database.types.ts` | 生成型の更新。起動中でないと空ファイルになる |

Studio: http://localhost:54323 （`robot_commands` の行や `mastra` スキーマのテーブルを目視できる）

## スキーマ変更フロー

```bash
# 1. 空の migration を作る（server/supabase/migrations/<timestamp>_<name>.sql）
pnpm exec supabase --workdir server migration new add_something

# 2. 生成された SQL ファイルを編集

# 3. 当て直して検証（既存データは消える前提）
pnpm db:reset

# 4. TypeScript の型を再生成
pnpm db:types

# 5. 型が変わったら影響範囲を確認
pnpm verify
```

migration ファイルと `packages/db/src/database.types.ts` は**必ず同じコミット**に入れる。

### `mastra` スキーマは migration に含めない

Mastra の `PostgresStore({ schemaName: 'mastra' })` が起動時にテーブルを**自動作成**する（`packages/agent/src/mastra/storage.ts`）。手書きの migration を作ると Mastra 側のスキーマ更新と衝突するので触らない。`pnpm db:reset` 後に `mastra` スキーマが消えても、次に `pnpm dev` / `pnpm agent:studio` を動かせば再作成される。

## テーブル

### `public.robot_commands`

ロボットへ送ったコマンドと結果のログ。

| 列 | 型 | 備考 |
|---|---|---|
| `id` | `uuid` | PK、`default gen_random_uuid()` |
| `thread_id` | `text` | 会話スレッド。index あり |
| `command` | `jsonb` | `robotCommandSchema` に一致する JSON、not null |
| `status` | `text` | `check in ('ok','error')` |
| `result` | `jsonb` | `RobotResult` |
| `created_at` | `timestamptz` | `default now()` |

書き込みは `packages/db/src/index.ts` の `logRobotCommand`。失敗してもアプリを落とさない（warn を出して握りつぶす）設計。

## RLS 方針

**`public` の全テーブルで RLS を有効にし、ポリシーは作らない。**

```sql
alter table public.robot_commands enable row level security;
-- policy は作らない
```

理由: このアプリに認証は無く、DB へのアクセスは**サーバー側の secret key 経由のみ**。secret key は RLS をバイパスするのでサーバーからは書ける一方、万一 anon key が漏れてもブラウザからは一切読めない。

`packages/db/src/server.ts` は `server-only` パッケージを使わず、`createServiceClient` の中の実行時ガード（`typeof window !== "undefined"` なら throw）でブラウザ実行を止めている。`server-only` は `mastra dev`（素の Node）で import した瞬間に例外になり Studio が起動できなくなるため。

## secret key を取り出す

```bash
pnpm exec supabase --workdir server status -o env | grep SECRET_KEY
# SECRET_KEY="sb_secret_..."
```

値は新形式（`sb_secret_...`）。これを `client/web/.env.local` の `SUPABASE_SECRET_KEY` に貼る。旧形式の JWT（`SERVICE_ROLE_KEY` の `eyJ...`）ではない点に注意。ローカルの値は固定なので、`db:reset` しても変わらない。

新しいテーブルを足したときも同じ扱いにする（RLS 有効 + ポリシー無し）。

## 認証が必要になったら

現状は認証なし・`proxy.ts` も置いていない。来場者ごとのログインが必要になった場合の手順:

1. `@supabase/ssr` を `client/web` に追加する
2. ブラウザ用 / サーバー用のクライアントを作り分ける（`createBrowserClient` / `createServerClient`）
3. **Next 16 では `middleware.ts` ではなく `proxy.ts`**。ここでセッション Cookie をリフレッシュする
4. サーバー側でユーザー確認をするときは `getSession()` ではなく **`getClaims()`**（あるいは `getUser()`）を使う。`getSession()` は Cookie の内容をそのまま返すので信用してはいけない
5. RLS を「ポリシー無し」から「`auth.uid()` ベースのポリシーあり」に変更し、secret key ではなく publishable key + ユーザーセッションでアクセスする形に移行する

参考: https://supabase.com/docs/guides/auth/server-side/nextjs

## よくあるトラブル

| 症状 | 対処 |
|---|---|
| `db:start` が Docker エラー | Docker Desktop を起動する。[setup.md](../setup.md) 参照 |
| ポート 54321-54323 が埋まっている | 別プロジェクトの Supabase を `supabase stop` する |
| `db:types` の出力が空 | 起動していない状態で実行した。`pnpm db:start` 後に再実行 |
| `robot_commands` に行が入らない | `SUPABASE_SECRET_KEY` が未設定（`createServiceClient` が `null` を返しログがスキップされる）。`pnpm exec supabase --workdir server status -o env \| grep SECRET_KEY` で取得して `.env.local` へ |
| 会話履歴が残らない | `DATABASE_URL` 未設定で in-memory になっている |
