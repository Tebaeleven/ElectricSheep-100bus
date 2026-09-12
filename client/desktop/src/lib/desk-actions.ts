/** Shared helpers for auto-open URLs and screenshot intents. */

const URL_RE = /https?:\/\/[^\s<>"'）】】）\]}>]+/gi;

const SCREENSHOT_RE =
  /スクリーンショット|スクショ|screenshot|画面[を]?撮|撮って|撮影|キャプチャ|capture\s*(the\s*)?screen/i;

export function extractHttpUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  const cleaned = found.map((u) =>
    u.replace(/[.,;:!?）】」』》>\]]+$/g, "")
  );
  const uniq: string[] = [];
  for (const u of cleaned) {
    if (isSafeHttpUrl(u) && !uniq.includes(u)) uniq.push(u);
  }
  return uniq;
}

export function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function wantsScreenshot(text: string): boolean {
  return SCREENSHOT_RE.test(text);
}

export function stripDataUrl(base64OrDataUrl: string): {
  mime: string;
  base64: string;
} {
  const m = base64OrDataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/
  );
  if (m) return { mime: m[1]!, base64: m[2]! };
  return { mime: "image/png", base64: base64OrDataUrl.replace(/\s/g, "") };
}
