#!/usr/bin/env node
/**
 * postinstall の保険。`node_modules/electron/dist`（Electron.app 本体）が無ければ
 * electron の install スクリプトを手で走らせる。
 *
 * 背景: `pnpm-workspace.yaml` の `allowBuilds` は pnpm 10.33+ の構文で、
 * それより古い pnpm では electron の install スクリプトが黙ってスキップされ、
 * `pnpm run electron` が「Electron.app が見つからない」で落ちていた。
 */
const { existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const distDir = join(root, "node_modules", "electron", "dist");
const installer = join(root, "node_modules", "electron", "install.js");

if (existsSync(distDir)) process.exit(0);
if (!existsSync(installer)) {
  // electron が devDependencies から外れている等。ここでは何もしない
  process.exit(0);
}

console.log(
  "[ghost-companion] Electron 本体（node_modules/electron/dist）が無いので install.js を実行します"
);
try {
  execFileSync(process.execPath, [installer], { stdio: "inherit", cwd: root });
} catch (err) {
  console.error(
    "[ghost-companion] Electron 本体の取得に失敗しました。手動で `node node_modules/electron/install.js` を実行してください:",
    err?.message ?? err
  );
  // インストール全体は落とさない（Next の開発だけなら Electron 本体は不要）
}
