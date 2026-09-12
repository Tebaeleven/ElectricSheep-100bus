#!/usr/bin/env node
const { execFileSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const needles = [
  path.join(root, "node_modules", "electron", "dist", "Electron.app"),
  path.join(root, "node_modules", ".bin", "electron"),
];

function pidsMatching(needle) {
  let out = "";
  try {
    out = execFileSync("pgrep", ["-f", needle], { encoding: "utf8" });
  } catch {
    return [];
  }
  return out
    .split("\n")
    .map((s) => Number(s.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

function settle() {
  try {
    execFileSync("sleep", ["0.4"], { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

const pids = [...new Set(needles.flatMap(pidsMatching))];
if (!pids.length) process.exit(0);

try {
  execFileSync("kill", ["-TERM", ...pids.map(String)], { stdio: "ignore" });
} catch {
  /* already gone */
}

const start = Date.now();
while (Date.now() - start < 1500) {
  const left = [...new Set(needles.flatMap(pidsMatching))];
  if (!left.length) {
    settle();
    process.exit(0);
  }
}

try {
  execFileSync("kill", ["-KILL", ...pids.map(String)], { stdio: "ignore" });
} catch {
  /* ignore */
}
settle();

