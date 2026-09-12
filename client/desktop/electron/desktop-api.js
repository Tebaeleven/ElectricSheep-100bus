/**
 * Desktop API — Next.js（client/web の `@workspace/devices`）から叩くための
 * ローカル HTTP サーバー。仕様は docs/specs/robot-api-requirements.md に従う。
 *
 *   GET  /api/v1/desktop/status         → 稼働状態・画面収録権限
 *   POST /api/v1/desktop/screenshot     → { mime_type, image_base64 }（Data URL 接頭辞なし）
 *   POST /api/v1/desktop/browser/open   → { url } を既定ブラウザで開く（http/https のみ）
 *
 * 待ち受けは 127.0.0.1 固定（外部ネットワークには晒さない）。
 * CORS ヘッダは付けない（Next のサーバー側からのみ呼ばれるため）。
 */
const { createServer } = require("http");
const { app, shell, systemPreferences } = require("electron");

/** 既定ポート。モック機器（@workspace/devices）と同じ番号に合わせている */
const DEFAULT_PORT = 8792;
/** EADDRINUSE のときにポートを +1 しながら試す回数 */
const PORT_RETRY = 10;
/** リクエスト本文の上限（ブラウザ起動の URL しか受けないので十分小さく） */
const MAX_BODY_BYTES = 64 * 1024;

const API_PREFIX = "/api/v1/desktop";

function log(message) {
  console.log(`[desktop-api] ${message}`);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** macOS の画面収録権限。他 OS では常に granted 扱い */
function screenPermission() {
  if (process.platform !== "darwin") return "granted";
  try {
    return systemPreferences.getMediaAccessStatus("screen");
  } catch {
    return "unknown";
  }
}

function isSafeHttpUrl(raw) {
  try {
    const url = new URL(String(raw || ""));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** JSON 本文を読む。content-type が JSON でなければ null（呼び出し側で 400） */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers["content-type"] || "");
    if (contentType && !contentType.includes("json")) {
      resolve({ ok: false, error: "content-type must be application/json" });
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({ ok: true, value: {} });
        return;
      }
      try {
        resolve({ ok: true, value: JSON.parse(text) });
      } catch {
        resolve({ ok: false, error: "invalid JSON body" });
      }
    });
  });
}

/**
 * サーバーを起動する。
 * @param {object} deps
 * @param {() => Promise<Buffer>} deps.capturePng 主ディスプレイの PNG を返す関数
 * @returns {Promise<{ port: number, close: () => void }>}
 */
async function startDesktopApiServer({ capturePng }) {
  const startedAt = Date.now();

  const server = createServer((req, res) => {
    const url = (req.url || "").split("?")[0];
    log(`${req.method || "?"} ${url}`);

    void (async () => {
      try {
        if (req.method === "GET" && url === `${API_PREFIX}/status`) {
          sendJson(res, 200, {
            state: "running",
            port: server.address()?.port ?? null,
            version: app.getVersion(),
            uptime_ms: Date.now() - startedAt,
            screen_permission: screenPermission(),
          });
          return;
        }

        if (req.method === "POST" && url === `${API_PREFIX}/screenshot`) {
          const permission = screenPermission();
          if (permission === "denied" || permission === "restricted") {
            sendJson(res, 403, {
              error: "screen_permission_denied",
              hint: "システム設定 > プライバシーとセキュリティ > 画面収録 で Electron（または Ghost Companion）を許可し、アプリを再起動してください",
              screen_permission: permission,
            });
            return;
          }
          const png = await capturePng();
          sendJson(res, 200, {
            mime_type: "image/png",
            image_base64: png.toString("base64"),
          });
          return;
        }

        if (req.method === "POST" && url === `${API_PREFIX}/browser/open`) {
          const body = await readJsonBody(req);
          if (!body.ok) {
            sendJson(res, 400, { error: body.error });
            return;
          }
          const target =
            typeof body.value?.url === "string" ? body.value.url.trim() : "";
          if (!isSafeHttpUrl(target)) {
            sendJson(res, 400, {
              error: "url は http または https のみ許可されています",
            });
            return;
          }
          await shell.openExternal(target);
          sendJson(res, 200, { ok: true, url: target });
          return;
        }

        sendJson(res, 404, { error: "not found" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`error: ${message}`);
        if (!res.headersSent) sendJson(res, 500, { error: message });
        else res.end();
      }
    })();
  });

  const basePort = Number(process.env.DESKTOP_API_PORT) || DEFAULT_PORT;
  const port = await listenWithRetry(server, basePort);
  log(`listening on http://127.0.0.1:${port}${API_PREFIX} (screen=${screenPermission()})`);

  return {
    port,
    close: () => {
      server.close();
    },
  };
}

/** EADDRINUSE なら +1 しながら空きポートを探す */
function listenWithRetry(server, basePort) {
  return new Promise((resolve, reject) => {
    let port = basePort;
    let attempts = 0;

    const onError = (err) => {
      if (err.code === "EADDRINUSE" && attempts < PORT_RETRY) {
        attempts += 1;
        port += 1;
        log(`port ${port - 1} is busy → retry on ${port}`);
        server.listen(port, "127.0.0.1");
        return;
      }
      server.off("error", onError);
      reject(err);
    };

    server.on("error", onError);
    server.once("listening", () => {
      server.off("error", onError);
      resolve(server.address().port);
    });
    server.listen(port, "127.0.0.1");
  });
}

module.exports = { startDesktopApiServer, DEFAULT_PORT };
