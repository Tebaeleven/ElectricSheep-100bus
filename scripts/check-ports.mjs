#!/usr/bin/env node
/**
 * ポート確認スクリプト。台帳（scripts/ports.json）と実際の LISTEN 状態・
 * client/web/.env.local の設定を突き合わせて、衝突と設定ミスを検出する。
 *
 *   pnpm ports:check           台帳の全ポートを表で確認（衝突があれば終了コード 1）
 *   pnpm ports:check --json    機械可読出力
 *   pnpm ports:free 8792       そのポートを掴んでいる PID を表示（既定は表示のみ）
 *   pnpm ports:free web --kill 該当 PID に SIGTERM を送る
 *   pnpm ports:check --help    台帳の一覧とヘルプ
 *
 * Node 22 の標準機能のみで動く（依存パッケージなし）。
 */
import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, "..")
const LEDGER_PATH = resolve(SCRIPT_DIR, "ports.json")

/** .env.local の探索順（先に見つかったものを正本として扱う） */
const ENV_LOCAL_CANDIDATES = [
  resolve(REPO_ROOT, "client/web/.env.local"),
  resolve(REPO_ROOT, ".env.local"),
]

/** 突き合わせ対象の env 名 */
const CHECKED_ENV_KEYS = [
  "DEVICE_MODE",
  "DESKTOP_BASE_URL",
  "RAIL_BASE_URL",
  "STACKCHAN_WS_URL",
  "ROBOT_BASE_URL",
]

/** 判定の種別。exitCode 1 になるのは "conflict" のみ */
const VERDICT = {
  ok: "OK",
  idle: "未起動",
  conflict: "衝突",
  warn: "注意",
}

// ---------------------------------------------------------------- 台帳

/** 台帳を読む */
function loadLedger() {
  const raw = JSON.parse(readFileSync(LEDGER_PATH, "utf8"))
  return raw
}

/** 台帳を [name, entry] の配列にしてポート昇順で返す */
function ledgerEntries(ledger) {
  return Object.entries(ledger.ports).sort((a, b) => a[1].port - b[1].port)
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
function listenersOf(port) {
  if (hasLsof()) return listenersByLsof(port)
  return listenersByNetcat(port)
}

/** lsof -nP -iTCP:<port> -sTCP:LISTEN の出力を解析する */
function listenersByLsof(port) {
  let output = ""
  try {
    output = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    )
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

/** lsof が無い環境向けフォールバック。PID は取れないので疎通だけ見る */
function listenersByNetcat(port) {
  try {
    execFileSync("nc", ["-z", "127.0.0.1", String(port)], { stdio: "ignore" })
    return [{ command: "unknown(nc)", pid: 0 }]
  } catch {
    return []
  }
}

// ---------------------------------------------------------------- env

/** .env.local を素朴に解析する（KEY=VALUE のみ。クォートは剥がす） */
function parseEnvFile(path) {
  const result = {}
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim()
    if (line === "" || line.startsWith("#")) continue
    const index = line.indexOf("=")
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

/** .env.local（先に見つかったもの）と process.env を合成する。process.env が優先 */
function loadEnv() {
  const source = ENV_LOCAL_CANDIDATES.find((path) => existsSync(path)) ?? null
  const fromFile = source ? parseEnvFile(source) : {}
  const merged = {}
  for (const key of CHECKED_ENV_KEYS) {
    merged[key] = process.env[key] ?? fromFile[key] ?? null
  }
  return { source, values: merged }
}

/** URL 文字列からポート番号を取り出す（既定ポートは補わない） */
function portOf(url) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.port === "" ? null : Number(parsed.port)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- 判定

/** プロセス名が期待に合うか（大文字小文字を無視した部分一致） */
function matchesExpectation(command, expect) {
  if (!expect || expect.length === 0) return true
  const lower = command.toLowerCase()
  return expect.some((candidate) => lower.includes(candidate.toLowerCase()))
}

/** 台帳の各ポートについて実際の状態を調べ、判定を付ける */
function inspectPorts(ledger) {
  const rows = []
  for (const [name, entry] of ledgerEntries(ledger)) {
    const listeners = listenersOf(entry.port)
    let verdict
    let note = ""
    if (listeners.length === 0) {
      verdict = "idle"
    } else if (listeners.every((l) => matchesExpectation(l.command, entry.expect))) {
      verdict = "ok"
    } else {
      verdict = "conflict"
      note = `期待プロセス（${(entry.expect ?? []).join(" / ")}）と違うプロセスが掴んでいます`
    }
    rows.push({
      name,
      port: entry.port,
      label: entry.label,
      kind: entry.kind,
      owner: entry.owner,
      cmd: entry.cmd,
      env: entry.env ?? null,
      expect: entry.expect ?? [],
      listeners,
      verdict,
      note,
    })
  }
  return rows
}

/** 台帳自体の重複（同じポートを 2 つの役割が使う設定ミス）を検出する */
function findLedgerDuplicates(ledger) {
  const byPort = new Map()
  for (const [name, entry] of ledgerEntries(ledger)) {
    const list = byPort.get(entry.port) ?? []
    list.push(name)
    byPort.set(entry.port, list)
  }
  const issues = []
  for (const [port, names] of byPort) {
    if (names.length > 1) {
      issues.push({
        level: "conflict",
        message: `台帳のポート ${port} が複数の役割に割り当てられています: ${names.join(", ")}`,
      })
    }
  }
  return issues
}

/**
 * env と台帳を突き合わせて設定ミスを検出する。
 * DEVICE_MODE=real なのに URL がモックのポートを指している等。
 */
function checkEnvConsistency(ledger, env, rows) {
  const issues = []
  const mode = (env.values.DEVICE_MODE ?? "mock").toLowerCase()
  const rowByPort = new Map(rows.map((row) => [row.port, row]))

  for (const [envKey, mapping] of Object.entries(ledger.envUrls)) {
    const url = env.values[envKey]
    if (!url) continue
    const port = portOf(url)
    if (port === null) {
      issues.push({
        level: "warn",
        message: `${envKey}=${url} にポート番号がありません（台帳と突き合わせできません）`,
      })
      continue
    }

    const mockName = mapping.mock
    const realName = mapping.real
    const mockPort = mockName ? ledger.ports[mockName]?.port : null
    const realPort = realName ? ledger.ports[realName]?.port : null

    if (mode === "real" && mockPort != null && port === mockPort) {
      // DEVICE_MODE=real + モックサーバーの URL は「HTTP 経路まで含めて確認する」
      // 正規の手順（docs/runbooks/devices.md）。ただし実機が同時に起動している場合は
      // 取り違えの可能性が高いので衝突として扱う。
      const realRow = realName ? rowByPort.get(realPort) : undefined
      if (realRow && realRow.verdict === "ok") {
        issues.push({
          level: "conflict",
          message: `DEVICE_MODE=real なのに ${envKey} がモックのポート ${port}（${mockName}）を指しています。実機 ${realPort}（${realName}）が起動中なので取り違えの可能性が高いです`,
        })
      } else {
        issues.push({
          level: "warn",
          message:
            realPort != null
              ? `DEVICE_MODE=real で ${envKey} はモックサーバー ${port}（${mockName}）を指しています。実機に繋ぐなら ${realPort}（${realName}）です`
              : `DEVICE_MODE=real で ${envKey} はモックサーバー ${port}（${mockName}）を指しています（HTTP 経路の確認用なら正しい設定です）`,
        })
      }
    }
    if (mode === "mock" && realPort != null && port === realPort) {
      issues.push({
        level: "warn",
        message: `DEVICE_MODE=mock なのに ${envKey} が実機のポート ${port}（${realName}）を指しています`,
      })
    }

    const row = rowByPort.get(port)
    if (!row) {
      issues.push({
        level: "warn",
        message: `${envKey} が指すポート ${port} は台帳にありません（台帳へ追記してください）`,
      })
      continue
    }
    if (row.verdict === "idle") {
      issues.push({
        level: "warn",
        message: `${envKey} が指すポート ${port}（${row.label}）で何も LISTEN していません。\`${row.cmd}\` を起動してください`,
      })
    }
  }

  // モックと実機の両方が同時に必要なポートを掴んでいないか（DESKTOP の取り違え防止）
  const desktopMock = rows.find((row) => row.name === "desktop_mock")
  const desktopReal = rows.find((row) => row.name === "desktop_real")
  if (desktopMock?.verdict === "ok" && desktopReal?.verdict === "ok") {
    const url = env.values.DESKTOP_BASE_URL
    const port = portOf(url)
    if (port !== null && port !== desktopMock.port && port !== desktopReal.port) {
      issues.push({
        level: "warn",
        message: `モック（${desktopMock.port}）と実機 Electron（${desktopReal.port}）が両方起動していますが、DESKTOP_BASE_URL=${url} はどちらも指していません`,
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------- 表示

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

function renderTable(headers, rows) {
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

/** listeners を "node(1234)" の形にする */
function formatListeners(listeners) {
  if (listeners.length === 0) return "-"
  return listeners
    .map((l) => (l.pid > 0 ? `${l.command}(${l.pid})` : l.command))
    .join(", ")
}

function printHuman(ledger, rows, issues, env) {
  const table = rows.map((row) => [
    String(row.port),
    row.name,
    row.label,
    (row.expect ?? []).join("/") || "-",
    formatListeners(row.listeners),
    VERDICT[row.verdict],
  ])
  console.log(
    renderTable(
      ["ポート", "名前", "役割", "期待プロセス", "実際の LISTEN", "判定"],
      table
    )
  )

  console.log("")
  console.log(
    `env: ${env.source ?? "（.env.local が見つかりません。client/web/.env.example をコピーしてください）"}`
  )
  for (const key of CHECKED_ENV_KEYS) {
    console.log(`  ${key}=${env.values[key] ?? "-"}`)
  }

  console.log("")
  if (issues.length === 0) {
    console.log("設定チェック: 問題なし")
  } else {
    for (const issue of issues) {
      const mark = issue.level === "conflict" ? "衝突" : "注意"
      console.log(`[${mark}] ${issue.message}`)
    }
  }

  const conflicts =
    rows.filter((row) => row.verdict === "conflict").length +
    issues.filter((issue) => issue.level === "conflict").length
  console.log("")
  console.log(
    conflicts === 0
      ? "衝突なし。安全に同時起動できます。"
      : `衝突 ${conflicts} 件。docs/ports.md の「衝突したときの直し方」を参照してください。`
  )
  if (ledger.reserved) {
    for (const [range, note] of Object.entries(ledger.reserved)) {
      console.log(`予約: ${range} … ${note}`)
    }
  }
}

// ---------------------------------------------------------------- free

/** name もしくはポート番号から台帳エントリを引く */
function resolveTarget(ledger, token) {
  const asNumber = Number(token)
  for (const [name, entry] of ledgerEntries(ledger)) {
    if (name === token || entry.port === asNumber) return { name, entry }
  }
  if (Number.isInteger(asNumber) && asNumber > 0 && asNumber < 65536) {
    return {
      name: `port:${asNumber}`,
      entry: { port: asNumber, label: "（台帳外）", cmd: "-", expect: [] },
    }
  }
  return null
}

function runFree(ledger, args) {
  const kill = args.includes("--kill")
  const token = args.find((arg) => !arg.startsWith("-"))
  if (!token) {
    console.error("使い方: pnpm ports:free <name|port> [--kill]")
    return 2
  }
  const target = resolveTarget(ledger, token)
  if (!target) {
    console.error(`不明な指定です: ${token}（pnpm ports:check --help で一覧を確認）`)
    return 2
  }
  const listeners = listenersOf(target.entry.port)
  console.log(
    `${target.name} — ポート ${target.entry.port}（${target.entry.label}）`
  )
  if (listeners.length === 0) {
    console.log("LISTEN しているプロセスはありません。")
    return 0
  }
  console.log(`掴んでいるプロセス: ${formatListeners(listeners)}`)
  if (!kill) {
    console.log("停止するには --kill を付けて再実行してください（SIGTERM を送ります）。")
    return 0
  }
  for (const listener of listeners) {
    if (listener.pid <= 0) {
      console.error("PID が取得できないため kill できません（lsof が必要です）。")
      return 1
    }
    try {
      process.kill(listener.pid, "SIGTERM")
      console.log(`SIGTERM を送りました: ${listener.command}(${listener.pid})`)
    } catch (error) {
      console.error(`kill 失敗: ${listener.pid} — ${error.message}`)
      return 1
    }
  }
  return 0
}

// ---------------------------------------------------------------- help

function printHelp(ledger) {
  console.log(`ポート確認スクリプト

  pnpm ports:check            台帳の全ポートを確認（衝突があれば終了コード 1）
  pnpm ports:check --json     機械可読な JSON で出力
  pnpm ports:free <name|port> 該当ポートを掴んでいる PID を表示
  pnpm ports:free <name|port> --kill  表示したうえで SIGTERM を送る

台帳（scripts/ports.json）:`)
  const rows = ledgerEntries(ledger).map(([name, entry]) => [
    String(entry.port),
    name,
    entry.kind,
    entry.label,
    entry.cmd,
    entry.env ?? "-",
  ])
  console.log(
    renderTable(["ポート", "名前", "種別", "役割", "起動コマンド", "env"], rows)
  )
  if (ledger.reserved) {
    for (const [range, note] of Object.entries(ledger.reserved)) {
      console.log(`\n予約: ${range} … ${note}`)
    }
  }
  console.log("\n詳細は docs/ports.md を参照。")
}

// ---------------------------------------------------------------- main

function main() {
  const args = process.argv.slice(2)
  const ledger = loadLedger()

  if (args.includes("--help") || args.includes("-h")) {
    printHelp(ledger)
    return 0
  }
  if (args[0] === "free") {
    return runFree(ledger, args.slice(1))
  }

  const rows = inspectPorts(ledger)
  const env = loadEnv()
  const issues = [
    ...findLedgerDuplicates(ledger),
    ...checkEnvConsistency(ledger, env, rows),
  ]
  const conflicts =
    rows.filter((row) => row.verdict === "conflict").length +
    issues.filter((issue) => issue.level === "conflict").length

  if (args.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          ports: rows.map((row) => ({
            name: row.name,
            port: row.port,
            label: row.label,
            kind: row.kind,
            owner: row.owner,
            cmd: row.cmd,
            env: row.env,
            expect: row.expect,
            listeners: row.listeners,
            verdict: row.verdict,
            note: row.note,
          })),
          env: { source: env.source, values: env.values },
          issues,
          conflicts,
          probe: hasLsof() ? "lsof" : "nc",
        },
        null,
        2
      )
    )
  } else {
    printHuman(ledger, rows, issues, env)
  }
  return conflicts === 0 ? 0 : 1
}

process.exitCode = main()
