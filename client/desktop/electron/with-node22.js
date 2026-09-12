#!/usr/bin/env node
/**
 * Electron 44 needs Node >= 22.12. Conda/base often ships Node 20 and
 * breaks install with ERR_REQUIRE_ESM on @electron/get.
 * Prefer nvm Node 22 when the current runtime is too old.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

function majorMinor(v) {
  const m = String(v).replace(/^v/, "").split(".");
  return { major: Number(m[0]) || 0, minor: Number(m[1]) || 0 };
}

function ok(v) {
  const { major, minor } = majorMinor(v);
  return major > 22 || (major === 22 && minor >= 12);
}

function nvmNode22() {
  const nvm = process.env.NVM_DIR || path.join(os.homedir(), ".nvm");
  const versions = path.join(nvm, "versions", "node");
  if (!fs.existsSync(versions)) return null;
  const dirs = fs
    .readdirSync(versions)
    .filter((d) => d.startsWith("v22."))
    .sort((a, b) => {
      const A = majorMinor(a);
      const B = majorMinor(b);
      return B.major - A.major || B.minor - A.minor || 0;
    });
  for (const d of dirs) {
    if (!ok(d)) continue;
    const bin = path.join(versions, d, "bin", "node");
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: node electron/with-node22.js <script> [args...]");
  process.exit(1);
}

let nodeBin = process.execPath;
if (!ok(process.version)) {
  const alt = nvmNode22();
  if (!alt) {
    console.error(
      `[ghost-companion] Node ${process.version} cannot run Electron 44.\n` +
        `Use Node >= 22.12 (Petassist uses nvm Node 22):\n` +
        `  nvm use 22\n` +
        `  npm run electron`
    );
    process.exit(1);
  }
  console.error(
    `[ghost-companion] Switching ${process.version} → ${alt} for Electron`
  );
  nodeBin = alt;
}

const r = spawnSync(nodeBin, args, {
  stdio: "inherit",
  env: process.env,
  cwd: path.join(__dirname, ".."),
});
process.exit(r.status == null ? 1 : r.status);
