#!/usr/bin/env node
/**
 * ハッカソン用「1 コマンド起動」スクリプト。
 *
 *   pnpm run up                 モック構成（既定プロファイル mock）
 *   pnpm run up real            Electron 実機構成
 *   pnpm run up demo            本番デモ構成（Studio・モック無し）
 *   pnpm run up web             Web 3000 だけ
 *   pnpm run up --dry-run       起動計画だけ表示する
 *   pnpm run up --help          ヘルプ
 *
 * ポートの正本は scripts/ports.json。起動前に scripts/check-ports.mjs --json で
 * 実際の LISTEN 状況を取り、別プロセスに取られていれば起動せずに止める。
 *
 * Node 22 の標準機能のみで動く（依存パッケージなし）。
 */
import { spawn, execFileSync } from "node:child_process"
import { copyFileSync, existsSync, readFileSync } from "node:fs"
import { createInterface } from "node:readline"
import { resolve } from "node:path"
import {
  COLOR,
  MAIN_REPO_ROOT,
  PREFIX_COLORS,
  REPO_ROOT,
  findStaleProcesses,
  loadLedger,
  paint,
  portOf,
  probe,
  renderTable,
  sleep,
  waitUntil,
} from "./lib/dev-common.mjs"

const ENV_LOCAL = resolve(REPO_ROOT, "client/web/.env.local")
const ENV_EXAMPLE = resolve(REPO_ROOT, "client/web/.env.example")
const DESKTOP_DIR = resolve(REPO_ROOT, "client/desktop")

/** 子プロセスの停止で SIGKILL に切り替えるまでの猶予 */
const KILL_GRACE_MS = 3000

/** ポートを持たないサービスを「起動した」とみなすまでの待ち時間 */
const PROCESS_READY_GRACE_MS = 1500

// ---------------------------------------------------------------- サービス定義

/**
 * 各サービスの起動方法と readiness の見方。
 * mode: "spawn"（このスクリプトが面倒を見る子プロセス）/ "oneshot"（起動して終わるコマンド）
 * critical: false のサービスは、失敗しても警告だけ出して残りの起動を続ける
 *（既定は critical。プロファイル側の nonCritical でも上書きできる）。
 */
function serviceDefs(ledger) {
  const p = (name) => portOf(ledger, name)
  return {
    supabase: {
      tag: "supabase",
      label: "Supabase（API / DB / Studio）",
      mode: "oneshot",
      ports: ["supabase_api", "supabase_db", "supabase_studio"],
      url: `http://127.0.0.1:${p("supabase_studio")}`,
      readyUrl: `http://127.0.0.1:${p("supabase_api")}/rest/v1/`,
      // 認証エラー（401）でも「Kong が応答している」ので Ready とみなす
      accept: () => true,
      command: ["pnpm", ["db:start"]],
      readyTimeoutMs: 240000,
      hint: "Docker Desktop が起動しているか確認してください",
      // 衝突しても止めない（Docker が掴んでいるのが正常）
      infra: true,
    },
    devices: {
      tag: "devices",
      label:
        "機器モック 4 台（レール / デスクトップ / スタックちゃん WS / スタックちゃん HTTP）",
      mode: "spawn",
      ports: [
        "rail_mock",
        "desktop_mock",
        "stackchan_mock",
        "stackchan_http_mock",
      ],
      url: `http://127.0.0.1:${p("rail_mock")}`,
      readyUrl: `http://127.0.0.1:${p("rail_mock")}/api/v1/rail/status`,
      accept: (body) => body.includes("state") || body.includes("position"),
      // スタックちゃん本体の HTTP モック（手・LED。実機 8765 の代わり）も Ready を見る
      extraReady: [
        {
          url: `http://127.0.0.1:${p("stackchan_http_mock")}/`,
          accept: (body) => body.includes("Obake"),
        },
      ],
      command: ["pnpm", ["devices:mock"]],
      readyTimeoutMs: 30000,
      // 失敗しても会話の本筋は動くので、止めずに続行する
      critical: false,
    },
    robot: {
      tag: "robot",
      label: "ロボットモックサーバー",
      mode: "spawn",
      ports: ["robot_mock"],
      url: `http://127.0.0.1:${p("robot_mock")}`,
      readyUrl: `http://127.0.0.1:${p("robot_mock")}/status`,
      accept: (body) => body.includes("commandCount"),
      command: ["pnpm", ["robot:mock"]],
      readyTimeoutMs: 30000,
      // 失敗しても会話の本筋は動くので、止めずに続行する
      critical: false,
    },
    stackchanBridge: {
      tag: "bridge",
      label: "スタックちゃん bridge（B 方式・機器の WS 受け口）",
      mode: "spawn",
      ports: ["stackchan_bridge"],
      url: `http://127.0.0.1:${p("stackchan_bridge")}/obake/status`,
      readyUrl: `http://127.0.0.1:${p("stackchan_bridge")}/obake/status`,
      accept: (body) => body.includes("connected"),
      command: ["pnpm", ["stackchan:bridge"]],
      readyTimeoutMs: 30000,
      hint: "8030 はファーム側の接続先に合わせた固定ポート（scripts/ports.json）",
    },
    stackchanMockDevice: {
      tag: "mock-device",
      label: "偽スタックちゃん（bridge に繋ぐ機器モック）",
      mode: "spawn",
      // ポートを持たない（bridge へ WS クライアントとして繋ぎに行くだけ）
      ports: [],
      url: "ポート無し（bridge に接続）",
      // readyUrl が null のサービスはプロセスの生存で Ready とみなす
      readyUrl: null,
      accept: () => true,
      command: ["pnpm", ["stackchan:mock-device"]],
      readyTimeoutMs: 20000,
      // 失敗しても会話の本筋は動くので、止めずに続行する
      critical: false,
      dependsOn: "stackchanBridge",
    },
    desktopNext: {
      tag: "desk-next",
      label: "Ghost Companion の Next（Electron 表示用 UI）",
      mode: "spawn",
      ports: ["desktop_next"],
      url: `http://127.0.0.1:${p("desktop_next")}`,
      readyUrl: `http://127.0.0.1:${p("desktop_next")}/`,
      accept: () => true,
      command: ["pnpm", ["--dir", "client/desktop", "run", "dev"]],
      readyTimeoutMs: 120000,
      preflight: checkDesktopInstalled,
    },
    electron: {
      tag: "electron",
      label: "Ghost Companion（Electron 実機 / Desktop API）",
      mode: "oneshot",
      ports: ["desktop_real"],
      url: `http://127.0.0.1:${p("desktop_real")}/api/v1/desktop/status`,
      readyUrl: `http://127.0.0.1:${p("desktop_real")}/api/v1/desktop/status`,
      accept: (body) => body.includes("running"),
      command: ["pnpm", ["--dir", "client/desktop", "run", "electron:open"]],
      readyTimeoutMs: 90000,
      dependsOn: "desktopNext",
      hint: "画面収録・マイクの許可は docs/runbooks/desktop.md を参照",
      preflight: checkDesktopInstalled,
    },
    web: {
      tag: "web",
      label: "Web（チャット / dev ダッシュボード）",
      mode: "spawn",
      ports: ["web"],
      url: `http://localhost:${p("web")}`,
      readyUrl: `http://127.0.0.1:${p("web")}/api/dev/env`,
      // 3000 に別の Next が居ても /api/dev/env は無いので Ready にならない
      accept: (body) => body.includes("deviceMode"),
      command: ["pnpm", ["--filter", "web", "dev"]],
      readyTimeoutMs: 120000,
    },
    studio: {
      tag: "studio",
      label: "Mastra Studio",
      mode: "spawn",
      ports: ["studio"],
      url: `http://localhost:${p("studio")}`,
      readyUrl: `http://127.0.0.1:${p("studio")}/`,
      accept: () => true,
      command: ["pnpm", ["agent:studio"]],
      readyTimeoutMs: 120000,
      // 失敗しても会話の本筋は動くので、止めずに続行する
      critical: false,
    },
  }
}

/** client/desktop の依存が入っているか（ルート workspace から除外されているので別 install） */
function checkDesktopInstalled() {
  const electronApp = resolve(
    DESKTOP_DIR,
    "node_modules/electron/dist/Electron.app"
  )
  if (existsSync(electronApp)) return null
  if (!existsSync(resolve(DESKTOP_DIR, "node_modules"))) {
    return "client/desktop の依存が未インストールです。`pnpm --dir client/desktop install` を実行してください"
  }
  return "Electron.app が見つかりません。`pnpm --dir client/desktop install` を実行してください（docs/runbooks/desktop.md）"
}

// ---------------------------------------------------------------- プロファイル

const WEB_URL = "http://localhost:3000"
const DEV_URL = "http://localhost:3000/dev"
/** Web に渡す bridge の URL（ポートはファーム側の接続先に合わせた固定値） */
const BRIDGE_URL = "http://127.0.0.1:8030"

/** 各プロファイルの構成。services は起動順 */
const PROFILES = {
  mock: {
    description: "全部モック。実機なしで会話と /dev を触れる既定構成",
    services: [
      "supabase",
      "stackchanBridge",
      "stackchanMockDevice",
      "devices",
      "robot",
      "web",
      "studio",
    ],
    // Web はプロセス内モックのまま。bridge と偽機器は /dev からカメラ画像・首制御を試すために起動する
    webEnv: { DEVICE_MODE: "mock" },
    // mock では bridge が落ちても会話は成立するので止めない
    nonCritical: ["stackchanBridge"],
    open: [WEB_URL, DEV_URL],
  },
  real: {
    description: "Electron 実機（Ghost Companion）に繋ぐ構成",
    services: ["supabase", "stackchanBridge", "desktopNext", "electron", "web", "studio"],
    webEnv: {
      DEVICE_MODE: "real",
      DESKTOP_BASE_URL: "http://127.0.0.1:8801",
      STACKCHAN_BRIDGE_URL: BRIDGE_URL,
    },
    open: [WEB_URL, DEV_URL],
  },
  demo: {
    description: "本番デモ用。real から Studio とモックを外し、チャット画面だけ開く",
    services: ["supabase", "stackchanBridge", "desktopNext", "electron", "web"],
    webEnv: {
      DEVICE_MODE: "real",
      DESKTOP_BASE_URL: "http://127.0.0.1:8801",
      STACKCHAN_BRIDGE_URL: BRIDGE_URL,
    },
    open: [WEB_URL],
    noStudio: true,
  },
  web: {
    description: "Web 3000 だけ（Supabase は起動していればそのまま使う）",
    services: ["web"],
    webEnv: {},
    open: [WEB_URL, DEV_URL],
  },
}

// ---------------------------------------------------------------- 引数

function parseArgs(argv) {
  const options = {
    profile: "mock",
    open: true,
    studio: true,
    bridge: true,
    mockDevice: false,
    dryRun: false,
    strict: false,
    forceStale: false,
    help: false,
  }
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") options.help = true
    else if (arg === "--no-open") options.open = false
    else if (arg === "--no-studio") options.studio = false
    else if (arg === "--no-bridge") options.bridge = false
    else if (arg === "--mock-device") options.mockDevice = true
    else if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--strict") options.strict = true
    else if (arg === "--force-stale") options.forceStale = true
    else if (arg.startsWith("-")) {
      throw new Error(`不明なオプションです: ${arg}`)
    } else if (PROFILES[arg]) options.profile = arg
    else {
      throw new Error(
        `不明なプロファイルです: ${arg}（${Object.keys(PROFILES).join(" / ")}）`
      )
    }
  }
  return options
}

function printHelp() {
  console.log(`必要なものをまとめて起動する（停止は pnpm down）

  pnpm run up [プロファイル] [オプション]

プロファイル:`)
  const rows = Object.entries(PROFILES).map(([name, profile]) => [
    name + (name === "mock" ? "（既定）" : ""),
    profile.description,
    profile.services.join(" → "),
  ])
  console.log(renderTable(["名前", "内容", "起動するもの"], rows))
  console.log(`
オプション:
  --no-open     起動後にブラウザを開かない
  --no-studio   Mastra Studio を起動しない
  --no-bridge   スタックちゃん bridge（8030）と偽機器を起動しない
  --mock-device 偽スタックちゃんと機器モック 4 台（8791-8794）も起動する（実機が無いとき。
                mock は既定で起動。real / demo では STACKCHAN_HTTP_URL も 8794 に向ける）
  --dry-run     起動計画だけ表示して終わる
  --strict      任意サービス（studio / mock 系）の失敗でも全部止める
  --force-stale 残骸プロセスの検出を無視して起動する
  --help        このヘルプ

重要度:
  必須  失敗したら全部止めて終了する（supabase / desk-next / electron / web、
        real・demo の bridge）
  任意  失敗しても赤字で警告して起動を続ける（studio / 機器モック / ロボットモック /
        偽スタックちゃん、mock の bridge）。--strict で全部「必須」になる

補足:
  * pnpm の \`up\` は pnpm 自身の update コマンドに取られるため、必ず \`pnpm run up\` と書く
    （\`pnpm start\` も同じものを起動する）。停止は \`pnpm down\`（そのまま書ける）
  * Ctrl+C でこのスクリプトが起動した子プロセスを全部止める。
    Supabase と Electron は止めないので、それらは \`pnpm down --all\` を使う
  * 起動前に「残骸プロセス」（LISTEN していない mastra dev / next dev など）を調べ、
    見つかったら起動せずに終わる。\`pnpm down\` で掃除してから起動し直すこと
  * ポートの正本は scripts/ports.json。詳細は docs/runbooks/launch.md`)
}

/**
 * プロファイルの services に --no-studio / --no-bridge / --mock-device を反映する。
 * --mock-device は bridge を起動するプロファイルにだけ偽機器と機器モックを差し込む（bridge の直後）。
 */
function resolveServiceKeys(profile, options, wantStudio) {
  let keys = profile.services.filter((key) => key !== "studio" || wantStudio)
  if (!options.bridge) {
    return keys.filter(
      (key) => key !== "stackchanBridge" && key !== "stackchanMockDevice"
    )
  }
  const wantMockDevice = options.mockDevice && keys.includes("stackchanBridge")
  if (!wantMockDevice) return keys
  if (!keys.includes("stackchanMockDevice")) {
    keys = keys.flatMap((key) =>
      key === "stackchanBridge" ? [key, "stackchanMockDevice"] : [key]
    )
  }
  // 機器モック（8794 のスタックちゃん HTTP を含む）も立てて、実機が無くても手・LED を試せるようにする
  if (!keys.includes("devices")) {
    keys = keys.flatMap((key) =>
      key === "stackchanMockDevice" ? [key, "devices"] : [key]
    )
  }
  return keys
}

// ---------------------------------------------------------------- env

/** .env.local が無ければ .env.example からコピーし、キー未設定を警告する */
function prepareEnvLocal() {
  if (!existsSync(ENV_LOCAL)) {
    if (!existsSync(ENV_EXAMPLE)) {
      warn("client/web/.env.example が見つかりません")
      return
    }
    copyFileSync(ENV_EXAMPLE, ENV_LOCAL)
    warn(
      `client/web/.env.local が無かったので .env.example からコピーしました。${COLOR.bold}キーを入れてください${COLOR.reset}（GOOGLE_GENERATIVE_AI_API_KEY / SUPABASE_SECRET_KEY）`
    )
  }
  const values = parseEnvFile(ENV_LOCAL)
  if (!values.GOOGLE_GENERATIVE_AI_API_KEY) {
    warn(
      `${COLOR.bold}GOOGLE_GENERATIVE_AI_API_KEY が未設定です${COLOR.reset}。会話（/api/chat）は失敗しますが、起動は続けます（https://aistudio.google.com/apikey）`
    )
  }
}

/** client/web/.env.local にそのキーが（空でない値で）書かれているか */
function envLocalHas(key) {
  if (!existsSync(ENV_LOCAL)) return false
  const value = parseEnvFile(ENV_LOCAL)[key]
  return value !== undefined && value !== ""
}

/** KEY=VALUE だけの素朴な解析（check-ports.mjs と同じ方針） */
function parseEnvFile(path) {
  const result = {}
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim()
    if (line === "" || line.startsWith("#")) continue
    const index = line.indexOf("=")
    if (index <= 0) continue
    let value = line.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    result[line.slice(0, index).trim()] = value
  }
  return result
}

// ---------------------------------------------------------------- ログ

function info(message) {
  console.log(`${paint(COLOR.cyan, "[up]")} ${message}`)
}
function warn(message) {
  console.log(`${paint(COLOR.yellow, "[up]")} ${message}`)
}
function fail(message) {
  console.error(`${paint(COLOR.red, "[up]")} ${message}`)
}

// ---------------------------------------------------------------- ポート確認

/** scripts/check-ports.mjs --json を呼んで台帳ごとの LISTEN 状況を得る */
function inspectPorts() {
  const output = execFileSync(
    process.execPath,
    [resolve(REPO_ROOT, "scripts/check-ports.mjs"), "--json"],
    { encoding: "utf8", cwd: REPO_ROOT, stdio: ["ignore", "pipe", "inherit"] }
  )
  const parsed = JSON.parse(output)
  return new Map(parsed.ports.map((row) => [row.name, row]))
}

/**
 * サービスが既に「同じ役割で」動いているか。
 * 動いていれば応答本文を返す（役割違いのプロセスなら null）。
 */
async function alreadyRunning(service) {
  // ポートを持たないサービス（偽スタックちゃん）は外から見分けられないので常に起動する
  if (service.readyUrl === null) return null
  let primaryBody = null
  for (const check of readyChecks(service)) {
    const result = await probe(check.url, 1500)
    if (!result.ok || !check.accept(result.body)) return null
    primaryBody ??= result.body
  }
  return primaryBody
}

/**
 * サービスの readiness を見る HTTP チェック一覧。
 * readyUrl（代表）に加えて extraReady があれば全部通って初めて Ready とする。
 */
function readyChecks(service) {
  const checks =
    service.readyUrl === null
      ? []
      : [{ url: service.readyUrl, accept: service.accept }]
  return [...checks, ...(service.extraReady ?? [])]
}

/** 再利用しようとしている web が、プロファイルと同じ DEVICE_MODE で動いているか */
function webModeOf(body) {
  try {
    return JSON.parse(body).deviceMode ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- 子プロセス

/** key -> { child, tag, color } */
const children = new Map()
let shuttingDown = false

/** 1 行ずつプレフィックスを付けて流す */
function pipeWithPrefix(stream, tag, color) {
  const reader = createInterface({ input: stream })
  reader.on("line", (line) => {
    process.stdout.write(`${paint(color, `[${tag}]`)} ${line}\n`)
  })
}

/** spawn サービスを起動する（detached にしてプロセスグループごと止められるようにする） */
function startService(key, service, color, extraEnv) {
  const [command, args] = service.command
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  })
  pipeWithPrefix(child.stdout, service.tag, color)
  pipeWithPrefix(child.stderr, service.tag, color)
  const entry = { child, tag: service.tag, color, exited: false }
  child.on("exit", (code, signal) => {
    entry.exited = true
    children.delete(key)
    if (shuttingDown) return
    const reason = signal ? `シグナル ${signal}` : `終了コード ${code}`
    warn(`${service.tag} が終了しました（${reason}）`)
    // 面倒を見ている子が全部居なくなったら（pnpm down 等）このスクリプトも終わる
    if (children.size === 0) {
      info("管理している子プロセスが全て終了したので終了します")
      process.exit(0)
    }
  })
  children.set(key, entry)
  return child
}

/** oneshot サービス（起動して終わるコマンド）を実行する */
function runOneshot(service, color, extraEnv) {
  return new Promise((resolvePromise) => {
    const [command, args] = service.command
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    })
    pipeWithPrefix(child.stdout, service.tag, color)
    pipeWithPrefix(child.stderr, service.tag, color)
    child.on("exit", (code) => resolvePromise(code ?? 1))
  })
}

/** 自分が起動した子プロセスを全部止める（SIGTERM → 3 秒後 SIGKILL） */
async function shutdown(exitCode) {
  if (shuttingDown) return
  shuttingDown = true
  const entries = [...children.values()]
  if (entries.length > 0) {
    info(
      `子プロセスを停止します（${entries.map((e) => e.tag).join(", ")}）。Supabase と Electron は動いたままです（止めるなら pnpm down --all）`
    )
    for (const entry of entries) killGroup(entry.child, "SIGTERM")
    const stopped = await waitUntil(
      async () => entries.every((entry) => entry.exited),
      { timeoutMs: KILL_GRACE_MS, intervalMs: 200 }
    )
    if (!stopped) {
      for (const entry of entries) {
        if (!entry.exited) killGroup(entry.child, "SIGKILL")
      }
      await sleep(300)
    }
  }
  process.exit(exitCode)
}

/** プロセスグループごとシグナルを送る（pnpm の下にぶら下がる子まで止めるため） */
function killGroup(child, signal) {
  if (child.pid === undefined) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // 既に終了している
    }
  }
}

// ---------------------------------------------------------------- main

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(error.message)
    return 2
  }
  if (options.help) {
    printHelp()
    return 0
  }

  const ledger = loadLedger()
  const defs = serviceDefs(ledger)
  const profile = PROFILES[options.profile]
  const wantStudio = options.studio && !profile.noStudio
  const keys = resolveServiceKeys(profile, options, wantStudio)

  // 起動計画
  const plan = keys.map((key, index) => ({
    key,
    service: defs[key],
    color: PREFIX_COLORS[index % PREFIX_COLORS.length],
    critical: isCritical(key, defs[key], profile, options),
  }))

  console.log(
    `${paint(COLOR.bold, `プロファイル ${options.profile}`)} — ${profile.description}`
  )
  console.log(
    renderTable(
      ["役割", "重要度", "ポート", "起動コマンド"],
      plan.map(({ service, critical }) => [
        service.label,
        critical ? "必須" : "任意",
        service.ports.length === 0
          ? "—"
          : service.ports.map((name) => portOf(ledger, name)).join(" / "),
        `${service.command[0]} ${service.command[1].join(" ")}`,
      ])
    )
  )
  console.log(
    `\n重要度: 必須 = 失敗したら全部止める / 任意 = 失敗しても警告して続行${options.strict ? "（--strict 指定のため全て必須）" : ""}`
  )
  const profileWebEnv = { ...profile.webEnv }
  if (!options.bridge) delete profileWebEnv.STACKCHAN_BRIDGE_URL
  // real / demo で --mock-device のときは、実機 HTTP（8765）の代わりにモック（8794）を見せる。
  // .env.local に STACKCHAN_HTTP_URL があればユーザーの指定が正なので上書きしない。
  // mock プロファイルは DEVICE_MODE=mock でプロセス内モックを使うため指定不要。
  if (
    keys.includes("devices") &&
    profile.webEnv.DEVICE_MODE === "real" &&
    !envLocalHas("STACKCHAN_HTTP_URL")
  ) {
    profileWebEnv.STACKCHAN_HTTP_URL = `http://127.0.0.1:${portOf(ledger, "stackchan_http_mock")}`
  }
  const webEnvText = Object.entries(profileWebEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ")
  console.log(
    `Web の env 上書き: ${webEnvText === "" ? "なし（client/web/.env.local のまま）" : webEnvText}`
  )
  console.log(
    `ブラウザ: ${options.open ? profile.open.join(" , ") : "開かない（--no-open）"}`
  )

  if (options.dryRun) {
    console.log("\n--dry-run のため何も起動しませんでした。")
    return 0
  }
  console.log("")

  // 残骸プロセス（LISTEN していない mastra dev / next dev など）があると
  // シングルインスタンスのロックで新しい Studio や Next が起動できない
  if (!options.forceStale) {
    const stale = findStaleProcesses(ledger)
    if (stale.length > 0) {
      fail(
        `残骸プロセスがあります。${paint(COLOR.bold, "pnpm down")} で掃除してください`
      )
      console.error(
        renderTable(
          ["PID", "種類", "コマンド"],
          stale.map((item) => [
            String(item.pid),
            item.label,
            shortenCommand(item.commandLine),
          ])
        )
      )
      fail("掃除せずに起動するなら --force-stale")
      return 1
    }
  }

  prepareEnvLocal()

  /** 非 critical サービスの失敗（サマリー表に出す） */
  const failures = []
  /** 失敗して起動を飛ばしたサービス */
  const skipped = new Set()

  /** 非 critical の失敗を記録して起動を続ける */
  function degrade(item, reason) {
    failures.push({ service: item.service, reason })
    skipped.add(item.key)
    fail(`${item.service.tag}: ${reason}`)
    warn(`${item.service.tag} は任意サービスなので、飛ばして起動を続けます`)
  }

  // 事前チェック（Electron 等）
  for (const item of plan) {
    const problem = item.service.preflight?.()
    if (!problem) continue
    if (item.critical) {
      fail(problem)
      return 1
    }
    degrade(item, problem)
  }

  // ポートの取り合いを起動前に止める
  const portRows = inspectPorts()
  const reuse = new Set()
  for (const item of plan) {
    if (skipped.has(item.key)) continue
    const { key, service } = item
    const runningBody = await alreadyRunning(service)
    if (runningBody !== null) {
      // web は DEVICE_MODE が違うと「繋がっているのに別の機器を見ている」事故になる
      const wantMode = profile.webEnv.DEVICE_MODE
      if (key === "web" && wantMode && webModeOf(runningBody) !== wantMode) {
        const reason = `3000 の Web は DEVICE_MODE=${webModeOf(runningBody)} で動いています（このプロファイルは ${wantMode}）`
        if (!item.critical) {
          degrade(item, reason)
          continue
        }
        fail(reason)
        fail(`${paint(COLOR.bold, "pnpm down")} で止めてから起動し直してください`)
        return 1
      }
      reuse.add(key)
      info(`${service.tag} は既に動いているので再利用します（${service.url}）`)
      continue
    }
    if (service.infra) continue
    let conflict = null
    for (const name of service.ports) {
      const row = portRows.get(name)
      const listeners = row?.listeners ?? []
      if (listeners.length === 0) continue
      const who = listeners.map((l) => `${l.command}(${l.pid})`).join(", ")
      conflict = `ポート ${row.port}（${row.label}）を別のプロセスが掴んでいます: ${who}`
      break
    }
    if (conflict === null) continue
    if (!item.critical) {
      degrade(item, conflict)
      continue
    }
    fail(conflict)
    fail(
      `${service.tag} はこのポートが必要です。${paint(COLOR.bold, "pnpm down")} で止めるか、${paint(COLOR.bold, "pnpm ports:free")} で誰が掴んでいるか確認してください`
    )
    return 1
  }

  // 起動
  process.on("SIGINT", () => void shutdown(0))
  process.on("SIGTERM", () => void shutdown(0))

  const webEnv = { ...profileWebEnv, PORT: String(portOf(ledger, "web")) }
  const started = []

  for (const item of plan) {
    if (skipped.has(item.key)) continue
    const { key, service, color, critical } = item
    if (reuse.has(key)) {
      started.push({ key, service, critical, state: "再利用" })
      continue
    }
    if (service.dependsOn) {
      const dependency = plan.find((other) => other.key === service.dependsOn)
      if (dependency) {
        const dependencyReady =
          !skipped.has(dependency.key) &&
          (reuse.has(dependency.key) ||
            (await waitReady(dependency.service, dependency.key)))
        if (!dependencyReady) {
          const reason = `依存している ${dependency.service.tag} が Ready になりませんでした`
          if (!critical) {
            degrade(item, reason)
            continue
          }
          fail(reason)
          await shutdown(1)
          return 1
        }
      }
    }
    const extraEnv = key === "web" ? webEnv : {}
    if (service.mode === "oneshot") {
      info(`${service.tag} を起動します（${service.command[1].join(" ")}）`)
      const code = await runOneshot(service, color, extraEnv)
      if (code !== 0) {
        const reason = `起動コマンドが失敗しました（終了コード ${code}）`
        if (service.hint) fail(service.hint)
        if (!critical) {
          degrade(item, reason)
          continue
        }
        fail(`${service.tag} の${reason}`)
        await shutdown(1)
        return 1
      }
    } else {
      info(`${service.tag} を起動します`)
      startService(key, service, color, extraEnv)
    }
    started.push({ key, service, critical, state: "起動" })
  }

  // readiness
  const summary = []
  for (const { key, service, critical, state } of started) {
    if (state === "再利用") {
      summary.push([service.label, service.url, paint(COLOR.green, "再利用")])
      continue
    }
    const ready = await waitReady(service, key)
    if (ready) {
      summary.push([service.label, service.url, paint(COLOR.green, "Ready")])
      info(`${service.tag} Ready`)
      continue
    }
    const reason = `Ready になりませんでした（${service.readyUrl ?? "プロセスが起動直後に終了しました"}）`
    fail(`${service.tag} が ${reason}`)
    if (service.hint) fail(service.hint)
    if (critical) {
      await shutdown(1)
      return 1
    }
    // 中途半端に生き残った子は止める（他のサービスはそのまま動かす）
    stopChild(key)
    failures.push({ service, reason })
    warn(`${service.tag} は任意サービスなので、このまま続けます`)
  }
  for (const failure of failures) {
    summary.push([
      failure.service.label,
      failure.service.url ?? "—",
      paint(COLOR.red, `失敗（${shortenReason(failure.reason)}）`),
    ])
  }

  console.log("")
  console.log(paint(COLOR.bold, "起動しました"))
  console.log(renderTable(["役割", "URL", "状態"], summary))
  console.log("")
  if (failures.length > 0) {
    fail(
      `任意サービス ${failures.length} 件が失敗しています（起動は続行しました。全部止めたいときは --strict）`
    )
    console.log("")
  }

  if (options.open) {
    for (const url of profile.open) openBrowser(url)
  }

  if (children.size === 0) {
    info("このスクリプトが管理する子プロセスはありません（全て再利用）。終了します。")
    return 0
  }
  info(
    `Ctrl+C でこのスクリプトが起動した子プロセスを停止します（Supabase / Electron は残るので pnpm down --all）`
  )
  // 子プロセスが動いている限り待ち続ける
  await new Promise(() => {})
  return 0
}

/**
 * このサービスの失敗で全部止めるか。
 * --strict なら全部必須。プロファイルの nonCritical が service.critical より優先。
 */
function isCritical(key, service, profile, options) {
  if (options.strict) return true
  if (profile.nonCritical?.includes(key)) return false
  return service.critical !== false
}

/** 非 critical で失敗したサービスの子プロセスだけを止める */
function stopChild(key) {
  const entry = children.get(key)
  if (entry === undefined || entry.exited) return
  killGroup(entry.child, "SIGTERM")
}

/** 残骸一覧の表示用にコマンドラインを短くする */
function shortenCommand(commandLine) {
  const relative = commandLine.split(`${MAIN_REPO_ROOT}/`).join("")
  return relative.length > 70 ? `${relative.slice(0, 69)}…` : relative
}

/** サマリー表に収まるよう理由を短くする */
function shortenReason(reason) {
  const single = String(reason).split("\n").join(" ")
  return single.length > 60 ? `${single.slice(0, 59)}…` : single
}

/** readiness を待つ */
async function waitReady(service, key) {
  if (service.readyUrl === null) {
    // ポートを持たないサービスは「起動直後に落ちていないこと」で Ready とみなす
    await sleep(PROCESS_READY_GRACE_MS)
    const entry = children.get(key)
    return entry !== undefined && !entry.exited
  }
  const checks = readyChecks(service)
  return waitUntil(
    async () => {
      for (const check of checks) {
        const result = await probe(check.url, 2000)
        if (!result.ok || !check.accept(result.body)) return false
      }
      return true
    },
    { timeoutMs: service.readyTimeoutMs ?? 60000, intervalMs: 500 }
  )
}

/** 既定ブラウザで開く（macOS の open。失敗しても起動は続ける） */
function openBrowser(url) {
  if (process.platform !== "darwin") {
    info(`ブラウザで開いてください: ${url}`)
    return
  }
  const child = spawn("open", [url], { stdio: "ignore", detached: true })
  child.on("error", () => info(`ブラウザで開いてください: ${url}`))
  child.unref()
}

main()
  .then((code) => {
    if (code !== 0) process.exitCode = code
  })
  .catch(async (error) => {
    fail(String(error?.stack ?? error))
    await shutdown(1)
  })
