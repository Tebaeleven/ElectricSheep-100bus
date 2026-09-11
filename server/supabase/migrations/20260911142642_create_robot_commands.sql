-- ロボットへ送ったコマンドと結果の監査ログ。
-- Mastra の会話履歴は mastra スキーマに Mastra 自身が自動作成するため、ここでは扱わない。
create table public.robot_commands (
  id uuid primary key default gen_random_uuid(),
  thread_id text,
  command jsonb not null,
  status text not null check (status in ('ok', 'error')),
  result jsonb,
  created_at timestamptz not null default now()
);

comment on table public.robot_commands is 'ロボットコマンドの実行ログ（サーバー専用・secret key でのみ書き込む）';

-- RLS は有効にするがポリシーは意図的に置かない。
-- ＝ anon/authenticated からは一切読み書きできず、secret key（service_role）だけが到達できる。
alter table public.robot_commands enable row level security;

-- スレッド単位の履歴引き当て用
create index robot_commands_thread_id_idx on public.robot_commands (thread_id);

-- 新着順の一覧用
create index robot_commands_created_at_idx on public.robot_commands (created_at desc);
