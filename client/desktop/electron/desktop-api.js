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

/**
 * 既定ポート。モック機器（@workspace/devices の 8791-8793）と帯を分けるため 8801。
 * 台帳は scripts/ports.json（desktop_real）。8802 以降は将来のローカルブリッジ用に予約。
 */
const DEFAULT_PORT = 8801;
/** リクエスト本文の上限（ブラウザ起動の URL しか受けないので十分小さく） */
const MAX_BODY_BYTES = 64 * 1024;

const API_PREFIX = "/api/v1/desktop";

function log(message) {
  console.log(`[desktop-api] ${message}`);
}

function logError(message) {
  console.error(`[desktop-api] ${message}`);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** macOS のメディア権限。他 OS では常に granted 扱い */
function mediaPermission(kind) {
  if (process.platform !== "darwin") return "granted";
  try {
    return systemPreferences.getMediaAccessStatus(kind);
  } catch {
    return "unknown";
  }
}

/** 画面収録権限 */
function screenPermission() {
  return mediaPermission("screen");
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
 * ポートが使用中でも**ポートを +1 せず**、警告を出して API だけ無効にする
 * （黙ってずれると DESKTOP_BASE_URL と食い違うため）。アプリの起動は続ける。
 * @param {object} deps
 * @param {() => Promise<Buffer>} deps.capturePng 主ディスプレイの PNG を返す関数
 * @returns {Promise<{ port: number | null, close: () => void }>}
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
            // 権限の切り分け用（マイクは Desktop API では使わないが状態を出す）
            microphone_permission: mediaPermission("microphone"),
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

  const port = Number(process.env.DESKTOP_API_PORT) || DEFAULT_PORT;
  try {
    await listenOnce(server, port);
  } catch (err) {
    server.close();
    if (err && err.code === "EADDRINUSE") {
      logError(
        `ポート ${port} が使用中です。pnpm ports:check で確認してください（Desktop API は無効のまま起動します）`
      );
    } else {
      logError(`ポート ${port} を待ち受けできませんでした: ${err?.message ?? err}`);
    }
    notifyPortBusy(port);
    return { port: null, close: () => {} };
  }
  log(`listening on http://127.0.0.1:${port}${API_PREFIX} (screen=${screenPermission()})`);

  return {
    port,
    close: () => {
      server.close();
    },
  };
}

/** 127.0.0.1 の指定ポートで 1 回だけ待ち受ける。失敗はそのまま reject する */
function listenOnce(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

/** 開いているウィンドウがあれば画面内にも警告を出す（無ければログのみ） */
function notifyPortBusy(port) {
  try {
    const { BrowserWindow } = require("electron");
    const message = `Desktop API のポート ${port} が使用中です。pnpm ports:check で確認してください。`;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("desktop-api:port-busy", { port, message });
      }
    }
  } catch {
    // ウィンドウがまだ無い / IPC が使えない場合はログだけで十分
  }
}

module.exports = { startDesktopApiServer, DEFAULT_PORT };
