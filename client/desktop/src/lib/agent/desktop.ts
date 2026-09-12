import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Jimp } from "jimp";
import { isSafeHttpUrl } from "@/lib/desk-actions";

const execFileAsync = promisify(execFile);
const MAX_EDGE = 1280;

export async function openHttpUrl(url: string) {
  if (!isSafeHttpUrl(url)) {
    return { ok: false as const, error: "only http(s) urls allowed" };
  }
  if (process.platform === "darwin") {
    await execFileAsync("open", [url], { timeout: 8000 });
    return { ok: true as const, url, opened: true };
  }
  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", url], { timeout: 8000 });
    return { ok: true as const, url, opened: true };
  }
  await execFileAsync("xdg-open", [url], { timeout: 8000 });
  return { ok: true as const, url, opened: true };
}

async function shrinkPng(buf: Buffer): Promise<{ mime: string; base64: string }> {
  try {
    const img = await Jimp.read(buf);
    const w = img.width;
    const h = img.height;
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    if (scale < 1) {
      img.resize({ w: Math.round(w * scale), h: Math.round(h * scale) });
    }
    const out = await img.getBuffer("image/jpeg", { quality: 72 });
    return { mime: "image/jpeg", base64: out.toString("base64") };
  } catch {
    return { mime: "image/png", base64: buf.toString("base64") };
  }
}

/** Local Mac screenshot via screencapture; returns compressed base64. */
export async function captureScreenBase64() {
  if (process.platform !== "darwin") {
    return {
      ok: false as const,
      error: "screenshot is only implemented for macOS in the server path",
    };
  }
  const dest = path.join(
    os.tmpdir(),
    `ghost-companion-shot-${process.pid}-${Date.now()}.png`
  );
  try {
    await execFileAsync("screencapture", ["-x", "-t", "png", dest], {
      timeout: 20000,
    });
    const buf = await fs.readFile(dest);
    const shot = await shrinkPng(buf);
    return {
      ok: true as const,
      mime: shot.mime,
      base64: shot.base64,
      bytes: Buffer.byteLength(shot.base64, "utf8"),
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "screenshot failed",
    };
  } finally {
    await fs.unlink(dest).catch(() => {});
  }
}
