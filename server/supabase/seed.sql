-- 動作確認用のダミー行（db reset のたびに投入される）
insert into public.robot_commands (thread_id, command, status, result)
values (
  'seed-thread',
  '{"type": "emote", "emotion": "happy"}'::jsonb,
  'ok',
  '{"ok": true, "status": 200, "latencyMs": 12}'::jsonb
);
