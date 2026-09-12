/**
 * 残骸プロセス検出（detectStaleProcesses）のテスト。
 *
 *   node --test scripts/lib/dev-common.test.mjs
 *
 * 実際の ps / lsof は叩かず、偽の ps 出力と偽の cwd を渡して判定だけを見る。
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"
import { detectStaleProcesses, isRepoFamilyPath } from "./dev-common.mjs"

const REPO = "/Users/dev/workspace/ElectricSheep-100bus"
const WORKTREE = `${REPO}/.claude/worktrees/feature-x`
const OTHER = "/Users/dev/workspace/SomeOtherProject"

/** `pid ppid command` の行を作る */
function ps(...rows) {
  return rows.map(([pid, ppid, command]) => `${pid} ${ppid} ${command}`).join("\n")
}

function detect(psOutput, options = {}) {
  return detectStaleProcesses({ psOutput, repoRoot: REPO, ...options })
}

test("メインチェックアウトの死んだ mastra dev を残骸として拾う", () => {
  const found = detect(
    ps([100, 1, `node ${REPO}/packages/agent/node_modules/.bin/../mastra/dist/index.js dev --dir src/mastra`])
  )
  assert.deepEqual(
    found.map((p) => [p.pid, p.kind]),
    [[100, "mastra-dev"]]
  )
})

test("worktree 配下の残骸も拾う", () => {
  const found = detect(
    ps([200, 1, `node ${WORKTREE}/packages/agent/node_modules/.bin/../mastra/dist/index.js dev`])
  )
  assert.equal(found.length, 1)
  assert.equal(found[0].pid, 200)
})

test("他プロジェクトの同種プロセスは絶対に対象外", () => {
  const found = detect(
    ps(
      [300, 1, `node ${OTHER}/packages/agent/node_modules/.bin/../mastra/dist/index.js dev`],
      [301, 1, `node ${OTHER}/node_modules/.bin/../next/dist/bin/next dev`]
    )
  )
  assert.deepEqual(found, [])
})

test("無関係な node プロセスは対象外", () => {
  const found = detect(
    ps(
      [400, 1, `node ${REPO}/scripts/check-ports.mjs --json`],
      [401, 1, "node /usr/local/lib/some-daemon.js"],
      [402, 1, `/bin/zsh -c "next dev"`],
      [403, 1, `grep -E next dev ${REPO}`]
    )
  )
  assert.deepEqual(found, [])
})

test("LISTEN しているプロセスとその親は稼働中とみなして残骸にしない", () => {
  const psOutput = ps(
    [500, 1, `node ${REPO}/packages/agent/node_modules/.bin/../mastra/dist/index.js dev`],
    [501, 500, `node ${REPO}/packages/agent/.mastra/output/index.mjs`],
    [600, 1, `node ${REPO}/packages/agent/node_modules/.bin/../mastra/dist/index.js dev`]
  )
  // 501 が 4111 を LISTEN している → 500（親）も稼働中。600 だけが残骸
  const found = detect(psOutput, { listeningPids: [501] })
  assert.deepEqual(
    found.map((p) => p.pid),
    [600]
  )
})

test("next-server はコマンドラインにパスが出ないので cwd で持ち主を見分ける", () => {
  const psOutput = ps(
    [700, 1, "next-server (v16.2.6)"],
    [701, 1, "next-server (v15.5.24)"]
  )
  const cwdLookup = (pid) => (pid === 700 ? `${WORKTREE}/client/web` : `${OTHER}/web`)
  const found = detect(psOutput, { cwdLookup })
  assert.deepEqual(
    found.map((p) => p.pid),
    [700]
  )
})

test("cwd が取れない（空文字）なら対象外に倒す", () => {
  const found = detect(ps([800, 1, "next-server (v16.2.6)"]), { cwdLookup: () => "" })
  assert.deepEqual(found, [])
})

test("偽スタックちゃん（mock-device）は残骸扱いしない", () => {
  const found = detect(
    ps([900, 1, `node ${REPO}/packages/stackchan-bridge/node_modules/.bin/../tsx/dist/cli.mjs src/mock-device.ts`])
  )
  assert.deepEqual(found, [])
})

test("モックサーバーと bridge の残骸を種類付きで拾う", () => {
  const found = detect(
    ps(
      [1000, 1, `node ${REPO}/packages/devices/node_modules/.bin/../tsx/dist/cli.mjs src/mock-servers.ts`],
      [1001, 1, `node ${REPO}/packages/robot/node_modules/.bin/../tsx/dist/cli.mjs src/mock-server.ts`],
      [1002, 1, `node ${REPO}/packages/stackchan-bridge/node_modules/.bin/../tsx/dist/cli.mjs src/cli.ts`]
    )
  )
  assert.deepEqual(
    found.map((p) => p.kind),
    ["devices-mock", "robot-mock", "stackchan-bridge"]
  )
})

test("ignorePids に入れた PID は除外される", () => {
  const psOutput = ps([1100, 1, `node ${REPO}/client/web/node_modules/.bin/../next/dist/bin/next dev`])
  assert.equal(detect(psOutput).length, 1)
  assert.equal(detect(psOutput, { ignorePids: [1100] }).length, 0)
})

test("isRepoFamilyPath は前方一致の別ディレクトリを弾く", () => {
  assert.equal(isRepoFamilyPath(REPO, REPO), true)
  assert.equal(isRepoFamilyPath(`${WORKTREE}/packages`, REPO), true)
  assert.equal(isRepoFamilyPath(`${REPO}-old/packages`, REPO), false)
  assert.equal(isRepoFamilyPath("", REPO), false)
})
