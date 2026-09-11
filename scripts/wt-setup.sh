#!/usr/bin/env bash
# 並列開発用の git worktree を作る。
#   使い方: pnpm wt setup <task> [base=develop]
set -euo pipefail

usage() {
  echo "使い方: pnpm wt setup <task> [base=develop]" >&2
  echo "  例: pnpm wt setup robot-client" >&2
  echo "      pnpm wt setup docs-runbook develop" >&2
}

if [ "$#" -lt 2 ] || [ "$1" != "setup" ]; then
  usage
  exit 1
fi

task="$2"
base="${3:-develop}"

root="$(git rev-parse --show-toplevel)"
worktree_dir="$root/.claude/worktrees/$task"

case "$task" in
  docs-*) branch="docs/$task" ;;
  *) branch="feat/$task" ;;
esac

if [ -e "$worktree_dir" ]; then
  echo "既に存在します: $worktree_dir" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "既存ブランチ $branch を使います"
  git worktree add "$worktree_dir" "$branch"
else
  git worktree add "$worktree_dir" -b "$branch" "$base"
fi

# .worktreeinclude に列挙された gitignore 対象ファイル（env 等）をコピー
include_file="$root/.worktreeinclude"
if [ -f "$include_file" ]; then
  while IFS= read -r rel || [ -n "$rel" ]; do
    [ -z "$rel" ] && continue
    case "$rel" in \#*) continue ;; esac
    if [ -f "$root/$rel" ]; then
      mkdir -p "$worktree_dir/$(dirname "$rel")"
      cp "$root/$rel" "$worktree_dir/$rel"
      echo "コピー: $rel"
    fi
  done < "$include_file"
fi

# mastra dev はパッケージ直下の .env を読むので symlink を張る
mkdir -p "$worktree_dir/packages/agent"
ln -sfn "../../client/web/.env.local" "$worktree_dir/packages/agent/.env"

cd "$worktree_dir"
pnpm install --prefer-offline

echo "完了: $worktree_dir (branch: $branch)"
