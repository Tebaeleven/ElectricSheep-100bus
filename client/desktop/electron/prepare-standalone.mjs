import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next/standalone");
const server = path.join(standalone, "server.js");

if (!existsSync(server)) {
  console.error(
    "[petassist] missing .next/standalone/server.js — run ELECTRON_DIST=1 next build"
  );
  process.exit(1);
}

const staticSrc = path.join(root, ".next/static");
const staticDest = path.join(standalone, ".next/static");
if (existsSync(staticSrc)) {
  mkdirSync(path.dirname(staticDest), { recursive: true });
  cpSync(staticSrc, staticDest, { recursive: true });
}

const publicSrc = path.join(root, "public");
const publicDest = path.join(standalone, "public");
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
}

console.log("[petassist] standalone ready for electron-builder");
