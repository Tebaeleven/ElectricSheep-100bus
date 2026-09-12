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

/**
 * URL を 1 回だけ叩く。応答すれば { ok: true, status, body }。
 * 到達できなければ { ok: false }。
 */
export async function probe(url, timeoutMs = 1500) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "*/*" },
    })
    const body = await response.text()
    return { ok: true, status: response.status, body }
  } catch {
    return { ok: false, status: 0, body: "" }
  }
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
