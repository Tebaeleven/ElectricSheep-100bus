const { fork } = require("child_process");
const path = require("path");
const { app } = require("electron");

const PACKAGED_PORT = "3847";
let child = null;

function packagedOrigin() {
  return `http://127.0.0.1:${PACKAGED_PORT}`;
}

function startPackagedDesk() {
  if (!app.isPackaged) return null;
  if (child) return packagedOrigin();
  const standalone = path.join(process.resourcesPath, "standalone");
  const server = path.join(standalone, "server.js");
  child = fork(server, [], {
    cwd: standalone,
    execPath: process.execPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: PACKAGED_PORT,
      HOSTNAME: "127.0.0.1",
    },
    stdio: "pipe",
  });
  child.stderr?.on("data", (buf) => {
    console.error("[petassist] desk", String(buf).trimEnd());
  });
  child.on("error", (err) => {
    console.error("[petassist] desk server failed", err);
  });
  child.on("exit", (code) => {
    if (!code) return;
    console.error("[petassist] desk server exited", code);
  });
  return packagedOrigin();
}

function stopPackagedDesk() {
  if (!child) return;
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  child = null;
}

module.exports = { startPackagedDesk, stopPackagedDesk, packagedOrigin };
