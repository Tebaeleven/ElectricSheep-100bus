/**
 * Codex-style workspace-write: commands may run inside granted folders.
 * Full Mac access still allows any command. A few patterns never run.
 */

const ALLOWED = new Set([
  "cd",
  "ls",
  "pwd",
  "echo",
  "cat",
  "head",
  "tail",
  "wc",
  "file",
  "stat",
  "diff",
  "tree",
  "mkdir",
  "mv",
  "cp",
  "touch",
  "rm",
  "chmod",
  "ln",
  "find",
  "grep",
  "rg",
  "which",
  "test",
  "[",
  "node",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "deno",
  "python",
  "python3",
  "pip",
  "pip3",
  "uv",
  "git",
  "make",
  "tsc",
  "vite",
  "next",
  "eslint",
  "prettier",
  "zip",
  "unzip",
  "tar",
  "open",
  "swift",
  "swiftc",
  "cargo",
  "rustc",
  "go",
  "ruby",
  "perl",
]);

export type ShellDecision =
  | { ok: true }
  | { ok: false; reason: string; fatal?: boolean };

function splitSegments(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      cur += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    const rest = command.slice(i);
    if (rest.startsWith("&&") || rest.startsWith("||")) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i += 1;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "\n") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function firstToken(segment: string): string {
  const parts = segment.trim().split(/\s+/);
  let i = 0;
  while (i < parts.length && /^(?:[A-Za-z_][A-Za-z0-9_]*=.*|\d*>|\d*<)/.test(parts[i]!)) {
    i += 1;
  }
  const raw = parts[i] ?? "";
  const unquoted = raw.replace(/^['"]|['"]$/g, "");
  const base = unquoted.split(/[\\/]/).pop() ?? unquoted;
  return base.toLowerCase();
}

function pipedToShell(command: string) {
  return /\b(curl|wget|fetch)\b[\s\S]{0,200}\|\s*(sh|bash|zsh|ksh)\b/i.test(command);
}

function rmWipesRoot(segment: string) {
  if (!/\brm\b/.test(segment)) return false;
  if (!/-[a-zA-Z]*r[a-zA-Z]*f\b|--recursive/.test(segment)) return false;
  return /(?:^|\s)(\/|~|\$HOME|\/Users\/?|\/System\/?|\/Library\/?|\/Applications\/?)(?:\s|$)/.test(
    segment
  );
}

export function inspectShellCommand(command: string): ShellDecision {
  const text = command.trim();
  if (!text) return { ok: false, reason: "Empty command", fatal: true };
  if (/\bsudo\b|\bsu\b/.test(text)) {
    return { ok: false, reason: "sudo / su is not allowed", fatal: true };
  }
  if (pipedToShell(text)) {
    return {
      ok: false,
      reason: "Piping downloads into a shell is not allowed",
      fatal: true,
    };
  }
  for (const segment of splitSegments(text)) {
    if (rmWipesRoot(segment)) {
      return { ok: false, reason: "Refusing a recursive delete of a system path", fatal: true };
    }
    const bin = firstToken(segment);
    if (!bin) continue;
    if (!ALLOWED.has(bin)) {
      return {
        ok: false,
        reason: `${bin} needs Allow (not on the workspace command list)`,
      };
    }
  }
  return { ok: true };
}
