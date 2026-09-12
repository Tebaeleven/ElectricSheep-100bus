import { spawnSync } from "node:child_process";

const env = { ...process.env, ELECTRON_DIST: "1" };

function run(command) {
  const result = spawnSync(command, {
    env,
    stdio: "inherit",
    shell: true,
  });
  if (result.status) process.exit(result.status);
}

run("npx next build");
run("node electron/prepare-standalone.mjs");
run("npx electron-builder --publish never");
