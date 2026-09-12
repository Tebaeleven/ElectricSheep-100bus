/**
 * dev-up / dev-down で共有する小道具。
 * Node 22 の標準機能のみで動く（依存パッケージなし）。
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const LIB_DIR = dirname(fileURLToPath(import.meta.url))

/** scripts/ の親＝リポジトリルート */
export const REPO_ROOT = resolve(LIB_DIR, "..", "..")
/** ポート台帳（正本） */
export const LEDGER_PATH = resolve(REPO_ROOT, "scripts", "ports.json")

/** 台帳を読む */
export function loadLedger() {
  return JSON.parse(readFileSync(LEDGER_PATH, "utf8"))
}

/** 台帳の名前からポート番号を引く */
export function portOf(ledger, name) {
  const entry = ledger.ports[name]
  if (!entry) throw new Error(`台帳に無い名前です: ${name}`)
  return entry.port
}

// ---------------------------------------------------------------- 色

const colorEnabled =
  process.env.NO_COLOR === undefined && process.env.TERM !== "dumb"

/** ANSI カラーコード（色無効時は素通し） */
export const COLOR = {
  reset: colorEnabled ? "\u001b[0m" : "",
  bold: colorEnabled ? "\u001b[1m" : "",
  dim: colorEnabled ? "\u001b[2m" : "",
  red: colorEnabled ? "\u001b[31m" : "",
  green: colorEnabled ? "\u001b[32m" : "",
  yellow: colorEnabled ? "\u001b[33m" : "",
  blue: colorEnabled ? "\u001b[34m" : "",
  magenta: colorEnabled ? "\u001b[35m" : "",
  cyan: colorEnabled ? "\u001b[36m" : "",
  gray: colorEnabled ? "\u001b[90m" : "",
}

/** サービスごとのプレフィックス色（順に割り当てる） */
export const PREFIX_COLORS = [
  COLOR.cyan,
  COLOR.green,
  COLOR.magenta,
  COLOR.yellow,
  COLOR.blue,
  COLOR.red,
]

export function paint(color, text) {
  if (!colorEnabled || color === "") return String(text)
  return `${color}${text}${COLOR.reset}`
}

// ---------------------------------------------------------------- 表

/** 全角を 2 桁として数える表示幅 */
function displayWidth(text) {
  let width = 0
  for (const char of String(text)) {
    const code = char.codePointAt(0)
    width += code > 0x1100 && !(code >= 0x2000 && code <= 0x206f) ? 2 : 1
  }
  return width
}

function pad(text, width) {
  const value = String(text)
  return value + " ".repeat(Math.max(0, width - displayWidth(value)))
}

/** ヘッダーと行の配列から簡易表を作る（check-ports.mjs と同じ見た目） */
export function renderTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(
      displayWidth(header),
      ...rows.map((row) => displayWidth(row[index] ?? ""))
    )
  )
  const line = (cells) =>
    cells.map((cell, index) => pad(cell, widths[index])).join("  ").trimEnd()
  const out = [line(headers), widths.map((w) => "-".repeat(w)).join("  ")]
  for (const row of rows) out.push(line(row))
  return out.join("\n")
}

// ---------------------------------------------------------------- 待ち受け調査

/** lsof が使えるか（1 回だけ判定してキャッシュする） */
let lsofAvailable = null
function hasLsof() {
  if (lsofAvailable !== null) return lsofAvailable
  try {
    execFileSync("which", ["lsof"], { stdio: "ignore" })
    lsofAvailable = true
  } catch {
    lsofAvailable = false
  }
  return lsofAvailable
}

/**
 * ポートを LISTEN しているプロセスを返す。
 * @returns {{ command: string, pid: number }[]}
 */
export function listenersOf(port) {
  if (!hasLsof()) return []
  let output = ""
  try {
    output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    // 該当なしのとき lsof は終了コード 1 を返す
    return []
  }
  const found = new Map()
  for (const line of output.split("\n").slice(1)) {
    const columns = line.trim().split(/\s+/)
    if (columns.length < 2) continue
    const pid = Number(columns[1])
    if (!Number.isInteger(pid)) continue
    found.set(pid, { command: columns[0], pid })
  }
  return [...found.values()]
}

/** PID のフルコマンドライン（取れなければ空文字） */
export function commandLineOf(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

/**
 * PID の作業ディレクトリ（取れなければ空文字）。
 * Next の dev サーバーはプロセス名を `next-server (v16.2.6)` に書き換えてしまい
 * コマンドラインからリポジトリを判定できないので、cwd で持ち主を見分ける。
 */
export function cwdOf(pid) {
  if (!hasLsof()) return ""
  try {
    const output = execFileSync("lsof", ["-a", "-d", "cwd", "-p", String(pid), "-Fn"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    const line = output
      .split("\n")
      .reverse()
      .find((row) => row.startsWith("n"))
    return line ? line.slice(1) : ""
  } catch {
    return ""
  }
}

// ---------------------------------------------------------------- HTTP

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** readiness 判定で読む本文の上限（これ以上は切り捨てる） */
export const MAX_PROBE_BODY_BYTES = 64 * 1024

/** 応答本文を上限まで読む（巨大な HTML を丸ごと抱えないため） */
async function readBodyCapped(response, limit) {
  if (!response.body) return (await response.text()).slice(0, limit)
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
      if (total >= limit) break
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // 読み終えた後の cancel は失敗してよい
    }
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(merged.subarray(0, limit))
}

/**
 * URL を 1 回だけ叩く。応答すれば { ok: true, status, body }。
 * 到達できなければ { ok: false }。
 * body は accept() で中身を見たいので必ず読む（最大 MAX_PROBE_BODY_BYTES）。
 */
export async function probe(url, timeoutMs = 1500) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "*/*" },
    })
    const body = await readBodyCapped(response, MAX_PROBE_BODY_BYTES)
    return { ok: true, status: response.status, body }
  } catch {
    return { ok: false, status: 0, body: "" }
  }
}

/** ログに出す用に本文の先頭だけ取り出す */
export function previewBody(body, limit = 120) {
  const single = String(body).replace(/\s+/g, " ").trim()
  if (single === "") return "（空）"
  return single.length > limit ? `${single.slice(0, limit - 1)}…` : single
}

/** JSON 本文をゆるくパースする（壊れていれば null） */
function parseJsonBody(body) {
  try {
    const value = JSON.parse(body)
    return typeof value === "object" && value !== null ? value : null
  } catch {
    return null
  }
}

/**
 * レールモックの GET /api/v1/rail/status の応答か。
 * 実機ファーム互換の本文は `{"type":"status", ..., "axes":[...]}` で、
 * "state" / "position" といった語は入らない（ここを取り違えると永遠に Ready にならない）。
 */
export function acceptsRailStatus(body) {
  const json = parseJsonBody(body)
  if (json === null) return false
  return json.type === "status" || Array.isArray(json.axes)
}

/** スタックちゃん HTTP モックのトップページか */
export function acceptsStackchanHttpRoot(body) {
  return String(body).includes("Obake")
}

/**
 * readiness チェック（{ url, accept }）を順に叩く。
 * 全部通れば { ready: true, bodies }。落ちたら failure に「どの URL がなぜ落ちたか」を入れる。
 * @param {{ url: string, accept: (body: string) => boolean }[]} checks
 */
export async function evaluateReadyChecks(
  checks,
  { probeFn = probe, timeoutMs = 2000 } = {}
) {
  const bodies = []
  for (const check of checks) {
    const result = await probeFn(check.url, timeoutMs)
    if (!result.ok) {
      return {
        ready: false,
        bodies,
        failure: { url: check.url, reason: "応答がありません（未起動 / 接続拒否 / タイムアウト）" },
      }
    }
    if (!check.accept(result.body)) {
      return {
        ready: false,
        bodies,
        failure: {
          url: check.url,
          reason: `応答の中身が想定と違います（HTTP ${result.status} / 本文: ${previewBody(result.body)}）`,
        },
      }
    }
    bodies.push(result.body)
  }
  return { ready: true, bodies, failure: null }
}

/**
 * readiness をポーリングする。
 * @param {() => Promise<boolean>} check true を返したら Ready
 */
export async function waitUntil(check, { timeoutMs, intervalMs = 400 }) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await check()) return true
    if (Date.now() >= deadline) return false
    await sleep(intervalMs)
  }
}

// ---------------------------------------------------------------- 残骸プロセス検出

/** worktree は `<メインチェックアウト>/.claude/worktrees/<名前>` に作る */
const WORKTREE_SEGMENT = "/.claude/worktrees/"

/**
 * メインチェックアウトのルート。
 * このスクリプトが worktree から動いている場合でも、掃除の対象は
 * 「メインチェックアウトとその配下の worktree 全部」なので親をたどって戻す。
 */
export const MAIN_REPO_ROOT = (() => {
  const index = REPO_ROOT.indexOf(WORKTREE_SEGMENT)
  return index === -1 ? REPO_ROOT : REPO_ROOT.slice(0, index)
})()

/** パスがこのリポジトリ一家（メイン + worktree）の中か。他プロジェクトは false */
export function isRepoFamilyPath(path, repoRoot = MAIN_REPO_ROOT) {
  if (typeof path !== "string" || path === "") return false
  return path === repoRoot || path.startsWith(`${repoRoot}/`)
}

/**
 * 掃除の対象にする開発プロセスの種類。
 * needle はコマンドライン（または cwd）に出る目印。
 */
export const STALE_KINDS = [
  {
    id: "mastra-dev",
    label: "Mastra Studio（mastra dev）",
    needles: ["mastra/dist/index.js dev"],
  },
  { id: "next-dev", label: "Next dev サーバー", needles: ["next dev"] },
  { id: "next-server", label: "Next dev サーバー（next-server）", needles: ["next-server"] },
  { id: "devices-mock", label: "機器モック 3 台", needles: ["src/mock-servers.ts"] },
  { id: "robot-mock", label: "ロボットモック", needles: ["src/mock-server.ts"] },
  {
    id: "stackchan-bridge",
    label: "スタックちゃん bridge",
    needles: ["stackchan-bridge"],
  },
]

/**
 * 目印に当たっても掃除の対象にしないもの。
 * 偽スタックちゃん（mock-device）はポートを持たない正規の常駐プロセスで、
 * dev-down の collectPortlessTargets が別途面倒を見る。
 */
const STALE_EXCLUDE_NEEDLES = ["mock-device"]

/** シェルや検索コマンドを巻き込まないための除外 */
const NON_TARGET_EXECUTABLES = new Set([
  "sh", "bash", "zsh", "grep", "rg", "ps", "tail", "less", "vim", "code",
])

/** ps の 1 行（`pid ppid command`）を分解する */
function parsePsLine(line) {
  const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
  if (!match) return null
  const commandLine = match[3].trim()
  if (commandLine === "") return null
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    commandLine,
  }
}

function executableNameOf(commandLine) {
  const first = commandLine.split(" ")[0] ?? ""
  return first.slice(first.lastIndexOf("/") + 1)
}

/** この 2 本のスクリプト自身（と pnpm ラッパー）は対象外 */
function isOwnTooling(commandLine) {
  return (
    commandLine.includes("scripts/dev-up.mjs") ||
    commandLine.includes("scripts/dev-down.mjs") ||
    commandLine.includes("scripts/check-ports.mjs")
  )
}

function matchStaleKind(commandLine, cwd) {
  const haystack = `${commandLine} ${cwd}`
  if (STALE_EXCLUDE_NEEDLES.some((needle) => haystack.includes(needle))) return null
  return (
    STALE_KINDS.find((kind) => kind.needles.some((n) => commandLine.includes(n))) ??
    null
  )
}

/**
 * 残骸プロセスを見つける（純関数。テストから偽の ps 出力を渡せる）。
 *
 * 「残骸」= このリポジトリ一家のプロセスで、掃除対象の種類に当たり、
 * かつ台帳のポートを LISTEN していない（親をたどっても LISTEN 側に繋がらない）もの。
 * LISTEN 中のプロセスとその親は「正常稼働中」なので残骸にはしない。
 *
 * @param {object} params
 * @param {string} params.psOutput `ps -Ao pid=,ppid=,command=` の出力
 * @param {number[]} [params.listeningPids] 台帳ポートを LISTEN している PID
 * @param {(pid: number) => string} [params.cwdLookup] PID の cwd（1 プロセスずつ引く）
 * @param {string} [params.repoRoot] メインチェックアウトのルート
 * @param {number[]} [params.ignorePids] 自分自身など除外する PID
 * @returns {{ pid: number, ppid: number, commandLine: string, kind: string, label: string }[]}
 */
export function detectStaleProcesses({
  psOutput,
  listeningPids = [],
  cwdLookup = () => "",
  repoRoot = MAIN_REPO_ROOT,
  ignorePids = [],
}) {
  const rows = []
  for (const line of String(psOutput).split("\n")) {
    const parsed = parsePsLine(line)
    if (parsed) rows.push(parsed)
  }
  const byPid = new Map(rows.map((row) => [row.pid, row]))

  // LISTEN しているプロセスとその祖先は「稼働中」とみなす
  const active = new Set()
  for (const pid of listeningPids) {
    let current = pid
    for (let depth = 0; depth < 32; depth += 1) {
      if (active.has(current)) break
      active.add(current)
      const row = byPid.get(current)
      if (!row || row.ppid <= 1) break
      current = row.ppid
    }
  }

  const ignore = new Set(ignorePids)
  const found = []
  for (const row of rows) {
    if (ignore.has(row.pid) || active.has(row.pid)) continue
    if (row.pid <= 1) continue
    if (NON_TARGET_EXECUTABLES.has(executableNameOf(row.commandLine))) continue
    if (isOwnTooling(row.commandLine)) continue
    if (!STALE_KINDS.some((kind) => kind.needles.some((n) => row.commandLine.includes(n)))) {
      continue
    }
    // 他プロジェクトを巻き込まないための持ち主判定。
    // コマンドラインにパスが出ないもの（next-server）だけ cwd を引く。
    const fromCommandLine = row.commandLine.includes(`${repoRoot}/`)
    const cwd = fromCommandLine ? "" : cwdLookup(row.pid)
    if (!fromCommandLine && !isRepoFamilyPath(cwd, repoRoot)) continue
    const kind = matchStaleKind(row.commandLine, cwd)
    if (!kind) continue
    found.push({
      pid: row.pid,
      ppid: row.ppid,
      commandLine: row.commandLine,
      kind: kind.id,
      label: kind.label,
      cwd,
    })
  }
  return found
}

/** 実環境の ps / lsof を使って残骸プロセスを探す */
export function findStaleProcesses(ledger, extraIgnorePids = []) {
  let psOutput = ""
  try {
    psOutput = execFileSync("ps", ["-Ao", "pid=,ppid=,command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return []
  }
  const listeningPids = []
  for (const entry of Object.values(ledger.ports)) {
    for (const listener of listenersOf(entry.port)) listeningPids.push(listener.pid)
  }
  return detectStaleProcesses({
    psOutput,
    listeningPids,
    // lsof は 1 プロセスずつ引く（まとめて渡すと 1 つ失敗しただけで全部落ちる）
    cwdLookup: (pid) => cwdOf(pid),
    ignorePids: [process.pid, process.ppid ?? 0, ...extraIgnorePids],
  })
}
