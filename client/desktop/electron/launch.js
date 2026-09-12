#!/usr/bin/env node
/** stop → wait-for-desk → electron ., always under Node >= 22.12 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const with22 = path.join(__dirname, "with-node22.js");

function run(scriptArgs) {
  const r = spawnSync(process.execPath, [with22, ...scriptArgs], {
    stdio: "inherit",
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });
  if (r.status !== 0) process.exit(r.status == null ? 1 : r.status);
}

console.log(
  "[ghost-companion] Electron needs Next.js. Keep `npm run dev` running in another terminal."
);
run([path.join(__dirname, "stop.js")]);
run([path.join(__dirname, "wait-for-desk.js")]);
run([path.join(root, "node_modules", "electron", "cli.js"), "."]);
