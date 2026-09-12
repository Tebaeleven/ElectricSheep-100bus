#!/usr/bin/env node
/**
 * macOS の権限（TCC）登録用の起動スクリプト。
 *
 * `electron .` をターミナルから起動すると、マイク等の権限要求は
 * **親プロセス（ターミナル）に帰属**するため許可ダイアログが出ず、
 * `systemPreferences.askForMediaAccess()` が即 false を返し、
 * システム設定の一覧にも Electron が現れない。
 *
 * LaunchServices（`open -n -a`）でアプリバンドルとして起動すると
 * Electron 自身が要求元になり、ダイアログが出て一覧に登録される。
 * 一度許可すれば、以降は `pnpm run electron` の通常起動でもマイクを使える。
 *
 * 注意: `open` 経由なのでアプリのログはターミナルに流れない
 * （ログを見たいときは `pnpm run electron` を使う）。
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

if (process.platform !== "darwin") {
  console.error("[ghost-companion] electron:open は macOS 専用です。`pnpm run electron` を使ってください。");
  process.exit(1);
}

/** node_modules/electron が指す Electron.app を探す */
function electronAppPath() {
  const dist = path.join(root, "node_modules", "electron", "dist", "Electron.app");
  if (fs.existsSync(dist)) return dist;
  const pathTxt = path.join(root, "node_modules", "electron", "path.txt");
  if (fs.existsSync(pathTxt)) {
    // 例: "Electron.app/Contents/MacOS/Electron"
    const rel = fs.readFileSync(pathTxt, "utf8").trim();
    const appDir = rel.split(".app")[0] + ".app";
    const full = path.join(root, "node_modules", "electron", "dist", appDir);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

const appPath = electronAppPath();
if (!appPath) {
  console.error(
    "[ghost-companion] Electron.app が見つかりません。`pnpm install` を実行してください。"
  );
  process.exit(1);
}

console.log(
  "[ghost-companion] Electron needs Next.js. Keep `pnpm run dev` running in another terminal."
);
console.log(`[ghost-companion] launching ${appPath} via LaunchServices`);
console.log(
  "[ghost-companion] 許可ダイアログが出たら「許可」を押してください（システム設定 > プライバシーとセキュリティ > マイク に Electron が登録されます）"
);

const result = spawnSync("open", ["-n", "-a", appPath, "--args", root], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
});
process.exit(result.status == null ? 1 : result.status);
