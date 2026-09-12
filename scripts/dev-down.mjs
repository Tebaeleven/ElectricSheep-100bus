#!/usr/bin/env node
/**
 * ハッカソン用「1 コマンド停止」スクリプト。
 *
 *   pnpm down            台帳の app / mock / real ポートを掴んでいる**このリポジトリの**プロセスを止める
 *   pnpm down --all      上に加えて Supabase（Docker）も止める
 *   pnpm down --yes      確認プロンプトを出さない
 *   pnpm down --help     ヘルプ
 *
 * **他プロジェクトのプロセスは絶対に触らない。** `ps -p <pid> -o command` にこのリポジトリの
 * フルパスが含まれるか、プロセスの cwd がこのリポジトリ配下のものだけを対象にする
 * （Next の dev サーバーはプロセス名を書き換えるので cwd で見る。名前だけの pkill はしない）。
 * Supabase（Docker）は --all のときだけ `pnpm db:stop` で止める。
 *
 * Node 22 の標準機能のみで動く（依存パッケージなし）。
 */
import { spawnSync } from "node:child_process"
import { createInterface } from "node:readline/promises"
import { resolve } from "node:path"
import {
  COLOR,
  REPO_ROOT,
  commandLineOf,
  cwdOf,
  listenersOf,
  loadLedger,
  paint,
  renderTable,
  sleep,
} from "./lib/dev-common.mjs"

/** SIGTERM のあと SIGKILL に切り替えるまでの猶予 */
const KILL_GRACE_MS = 3000

/** 開発ビルドの Electron.app（フルパスで指定する。名前だけの pkill はしない） */
const ELECTRON_APP = resolve(
  REPO_ROOT,
  "client/desktop/node_modules/electron/dist/Electron.app"
)

function info(message) {
  console.log(`${paint(COLOR.cyan, "[down]")} ${message}`)
}
function warn(message) {
  console.log(`${paint(COLOR.yellow, "[down]")} ${message}`)
}
function fail(message) {
  console.error(`${paint(COLOR.red, "[down]")} ${message}`)
}

function printHelp() {
  console.log(`起動中の開発プロセスを止める（起動は pnpm run up）

  pnpm down [オプション]

オプション:
  --all    Supabase（Docker）も止める（pnpm db:stop）
  --yes    確認プロンプトを出さない（TTY でなければ自動で yes）
  --help   このヘルプ

対象: scripts/ports.json の app / mock / real のポートを LISTEN していて、かつ
      コマンドラインか cwd が ${REPO_ROOT} 配下のプロセスだけ。
      他プロジェクトのプロセスには触らない。詳細は docs/runbooks/launch.md`)
}

/**
 * このリポジトリのプロセスか（他プロジェクトを巻き込まないための判定）。
 * コマンドラインにリポジトリのフルパスが出るもの（Electron・tsx・pnpm）はそれで、
 * プロセス名を書き換えてしまう Next の dev サーバーは cwd で判定する。
 */
function belongsToRepo(pid, commandLine) {
  if (commandLine.includes(REPO_ROOT)) return true
  const cwd = cwdOf(pid)
  return cwd !== "" && (cwd === REPO_ROOT || cwd.startsWith(`${REPO_ROOT}/`))
}

/** 台帳のうち infra（Docker）以外のポートを見て、止める対象を集める */
function collectTargets(ledger) {
  const targets = new Map() // pid -> { pid, command, ports: [] }
  const foreign = []
  for (const [name, entry] of Object.entries(ledger.ports)) {
    if (entry.kind === "infra") continue
    for (const listener of listenersOf(entry.port)) {
      const commandLine = commandLineOf(listener.pid)
      if (!belongsToRepo(listener.pid, commandLine)) {
        foreign.push({ name, port: entry.port, listener, commandLine })
        continue
      }
      const found = targets.get(listener.pid) ?? {
        pid: listener.pid,
        command: listener.command,
        commandLine: commandLine === "" ? listener.command : commandLine,
        ports: [],
      }
      found.ports.push(`${entry.port}（${name}）`)
      targets.set(listener.pid, found)
    }
  }
  return { targets: [...targets.values()], foreign }
}

/** プロセスが生きているか */
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Electron 本体と補助プロセスをフルパス指定で止める */
function stopElectron() {
  const result = spawnSync("pkill", ["-f", ELECTRON_APP], { stdio: "ignore" })
  // 0 = 該当あり / 1 = 該当なし
  if (result.status === 0) info("Electron（Ghost Companion）を停止しました")
}

/** コマンドラインを表示用に切り詰める */
function shorten(commandLine) {
  const relative = commandLine.split(`${REPO_ROOT}/`).join("")
  return relative.length > 70 ? `${relative.slice(0, 69)}…` : relative
}

async function confirm(question) {
  if (!process.stdin.isTTY) {
    info("TTY ではないので自動で続行します")
    return true
  }
  const reader = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await reader.question(`${question} [y/N] `)
  reader.close()
  return answer.trim().toLowerCase().startsWith("y")
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    printHelp()
    return 0
  }
  const stopAll = args.includes("--all")
  const assumeYes = args.includes("--yes") || args.includes("-y")
  const unknown = args.filter(
    (arg) => !["--all", "--yes", "-y", "--help", "-h"].includes(arg)
  )
  if (unknown.length > 0) {
    fail(`不明なオプションです: ${unknown.join(" ")}`)
    return 2
  }

  const ledger = loadLedger()
  const { targets, foreign } = collectTargets(ledger)

  for (const item of foreign) {
    warn(
      `ポート ${item.port}（${item.name}）は別プロジェクトのプロセスが掴んでいます: ${item.listener.command}(${item.listener.pid}) — 触りません`
    )
  }

  if (targets.length === 0) {
    info("このリポジトリのプロセスは見つかりませんでした")
  } else {
    console.log(paint(COLOR.bold, "停止する対象"))
    console.log(
      renderTable(
        ["PID", "ポート", "コマンド"],
        targets.map((target) => [
          String(target.pid),
          target.ports.join(", "),
          shorten(target.commandLine),
        ])
      )
    )
    console.log("")
    if (
      !assumeYes &&
      !(await confirm(
        stopAll
          ? "これらを停止し、Supabase も止めますか？"
          : "これらを停止しますか？"
      ))
    ) {
      info("中止しました")
      return 0
    }

    for (const target of targets) {
      try {
        process.kill(target.pid, "SIGTERM")
        info(`SIGTERM: ${target.pid}（${target.ports.join(", ")}）`)
      } catch (error) {
        warn(`kill 失敗: ${target.pid} — ${error.message}`)
      }
    }

    const deadline = Date.now() + KILL_GRACE_MS
    while (Date.now() < deadline && targets.some((t) => isAlive(t.pid))) {
      await sleep(200)
    }
    for (const target of targets) {
      if (!isAlive(target.pid)) continue
      try {
        process.kill(target.pid, "SIGKILL")
        warn(`SIGKILL: ${target.pid}（3 秒で止まらなかったため）`)
      } catch {
        // 既に終了している
      }
    }
  }

  stopElectron()

  if (stopAll) {
    info("Supabase を停止します（pnpm db:stop）")
    const result = spawnSync("pnpm", ["db:stop"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    })
    if (result.status !== 0) {
      fail("pnpm db:stop が失敗しました（Docker Desktop の状態を確認してください）")
      return 1
    }
  } else {
    info("Supabase は動いたままです（止めるなら pnpm down --all）")
  }

  info("確認: pnpm ports:check")
  return 0
}

main().then((code) => {
  process.exitCode = code
})
