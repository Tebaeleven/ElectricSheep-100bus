const { app, BrowserWindow, ipcMain, screen, dialog, Notification, session, shell, desktopCapturer, nativeImage, systemPreferences } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { startPackagedDesk, stopPackagedDesk } = require("./packaged-desk");
const { startDesktopApiServer } = require("./desktop-api");

/** Desktop API（Next から叩くローカル HTTP サーバー）のハンドル */
let desktopApi = null;

app.setName("Ghost Companion");

function originOf(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const loopback =
      host === "127.0.0.1" || host === "localhost" || host === "::1";
    const http = url.protocol === "http:" || url.protocol === "https:";
    if (loopback && http) return url.origin;
  } catch {
    /* ignore */
  }
  return null;
}

function deskBase() {
  return (
    originOf(process.env.GHOST_COMPANION_URL) ||
    originOf(process.env.PETASSIST_URL) ||
    "http://127.0.0.1:3000"
  );
}

let BASE = deskBase();

async function originAlive(origin) {
  try {
    const res = await fetch(`${origin}/api/companion/status`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data?.pets);
  } catch {
    return false;
  }
}

async function resolveDeskBase(preferred) {
  const guessed = [
    preferred,
    process.env.GHOST_COMPANION_URL,
    process.env.PETASSIST_URL,
    BASE,
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
  ]
    .map((raw) => (raw ? originOf(raw) : null))
    .filter(Boolean);
  const unique = [...new Set(guessed)];
  // Prefer a desk that includes the ghost companion (avoid latching onto a plain Petassist).
  const alive = [];
  for (const origin of unique) {
    if (await originAlive(origin)) alive.push(origin);
  }
  for (const origin of alive) {
    try {
      const res = await fetch(`${origin}/api/companion/status`, {
        signal: AbortSignal.timeout(800),
      });
      const data = await res.json();
      if (Array.isArray(data?.pets) && data.pets.some((p) => p?.id === "ghost")) {
        BASE = origin;
        return origin;
      }
    } catch {
      /* keep scanning */
    }
  }
  if (alive[0]) {
    BASE = alive[0];
    return alive[0];
  }
  return BASE;
}

async function waitForDesk(preferred, ms = 25000) {
  const deadline = Date.now() + ms;
  let last = preferred || BASE;
  while (Date.now() < deadline) {
    last = await resolveDeskBase(preferred);
    if (await originAlive(last)) return last;
    await new Promise((r) => setTimeout(r, 350));
  }
  return last;
}

function senderOrigin(event) {
  try {
    return originOf(event.sender.getURL()) || BASE;
  } catch {
    return BASE;
  }
}
const STICKY_W = 200;
const STICKY_H = 260;
/** Cursor sits on the sprite, not in empty window chrome. */
const STICKY_GRAB_X = Math.round(STICKY_W / 2);
const STICKY_GRAB_Y = 72;
const TOP_SNAP_PX = 56;
const PARTY_ORDER = ["ghost"];
const STICKY_SIZES = {
  compact: { width: STICKY_W, height: STICKY_H },
  chat: { width: 320, height: 420 },
  alert: { width: 320, height: 360 },
  choice: { width: 320, height: 340 },
  menu: { width: 260, height: 520 },
  settings: { width: 300, height: 540 },
};
const STICKY_GROW = new Set(["alert", "choice", "chat", "settings"]);
const STICKY_GROW_UP = new Set(["alert", "choice", "chat"]);
const PET_TOP_COMPACT = 4;
const PET_SLOT_H = 200;
const PET_BOTTOM_PAD = 8;

function petTopInWindow(mode, height) {
  if (STICKY_GROW_UP.has(mode)) return height - PET_BOTTOM_PAD - PET_SLOT_H;
  return PET_TOP_COMPACT;
}

/** @type {WeakMap<import("electron").BrowserWindow, string>} */
const stickyMode = new WeakMap();

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Map<string, BrowserWindow>} */
const stickies = new Map();
/** @type {Map<string, BrowserWindow>} */
const previews = new Map();
/** @type {Map<string, { x: number, y: number }>} */
const lastLeapPos = new Map();
/** @type {Set<string>} */
const leaping = new Set();
let isQuitting = false;

const LEAP_DURATION_MS = 1100;
const LEAP_HOPS = 5;
const LEAP_HOP_HEIGHT = 72;

function preloadPath() {
  return path.join(__dirname, "preload.js");
}

function lockToDesk(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, next) => {
    if (!originOf(next)) event.preventDefault();
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === "darwin") app.dock?.show();
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 460,
    minHeight: 640,
    title: "Ghost Companion",
    backgroundColor: "#eef3f9",
    show: false,
    webPreferences: {
      preload: preloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  lockToDesk(mainWindow);
  mainWindow.once("ready-to-show", () => {
    showMainWindow();
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[ghost-companion] desk failed to load", code, desc, url);
    if (code === -3) return;
    void resolveDeskBase().then((origin) => {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(`${origin}/desk`);
        }
      }, 600);
    });
  });
  mainWindow.loadURL(`${BASE}/desk`);
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      showMainWindow();
    }
  }, 2500);
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}

function stickyWebPrefs() {
  return {
    preload: preloadPath(),
    nodeIntegration: false,
    contextIsolation: true,
  };
}

function clampToDisplay(x, y, display, w = STICKY_W, h = STICKY_H) {
  const b = display.bounds;
  const sliver = 48;
  const cx = Math.min(Math.max(x, b.x + sliver - w), b.x + b.width - sliver);
  const cy = Math.min(Math.max(y, b.y + sliver - h), b.y + b.height - sliver);
  return { x: Math.round(cx), y: Math.round(cy) };
}

function cursorPoint() {
  return screen.getCursorScreenPoint();
}

function snapIfNearTop(point, display) {
  const b = display.bounds;
  if (point.y <= b.y + TOP_SNAP_PX) {
    return { x: point.x - STICKY_GRAB_X, y: b.y };
  }
  return { x: point.x - STICKY_GRAB_X, y: point.y - STICKY_GRAB_Y };
}

/** @type {{ win: import("electron").BrowserWindow, offset: { x: number, y: number }, passClicks: boolean } | null} */
let track = null;
let trackTimer = null;
const FRAME_MS = 16;

function stopTrack() {
  if (trackTimer != null) {
    clearTimeout(trackTimer);
    trackTimer = null;
  }
  if (track?.win && !track.win.isDestroyed() && track.passClicks) {
    try {
      track.win.setIgnoreMouseEvents(false);
    } catch {
      /* ignore */
    }
  }
  track = null;
}

function applyTrack() {
  if (!track || track.win.isDestroyed()) {
    stopTrack();
    return;
  }
  const p = cursorPoint();
  track.win.setPosition(
    Math.round(p.x - track.offset.x),
    Math.round(p.y - track.offset.y),
    false
  );
}

function startTrack(win, offset, passClicks = false) {
  if (!win || win.isDestroyed()) return;
  stopTrack();
  if (passClicks) {
    try {
      win.setIgnoreMouseEvents(true, { forward: true });
    } catch {
      /* ignore */
    }
  }
  track = { win, offset, passClicks };
  applyTrack();
  const tick = () => {
    applyTrack();
    if (track) trackTimer = setTimeout(tick, FRAME_MS);
  };
  trackTimer = setTimeout(tick, FRAME_MS);
}

/** @type {Set<string>} */
const hiddenStickies = new Set();

function broadcastPinned() {
  const payload = {
    pinned: [...stickies.keys()],
    hidden: [...hiddenStickies],
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("pet:pinned-changed", payload);
  }
}

function placeSticky(id, x, y, { clamp = true, immediate = false } = {}) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const pos = clamp
    ? clampToDisplay(x, y, display)
    : { x: Math.round(x), y: Math.round(y) };
  const existing = stickies.get(id);

  if (existing && !existing.isDestroyed()) {
    existing.setPosition(pos.x, pos.y, false);
    existing.show();
    hiddenStickies.delete(id);
    return existing;
  }

  const win = new BrowserWindow({
    width: STICKY_W,
    height: STICKY_H,
    x: pos.x,
    y: pos.y,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: true,
    acceptFirstMouse: true,
    ...(process.platform === "darwin" ? { type: "panel" } : {}),
    webPreferences: stickyWebPrefs(),
  });

  lockToDesk(win);
  win.setBackgroundColor("#00000000");
  try {
    win.setOpacity(0);
  } catch {
    /* ignore */
  }
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin") {
    win.setWindowButtonVisibility(false);
    try {
      win.setVibrancy(null);
    } catch {
      /* older Electron */
    }
  }
  let revealed = false;
  const reveal = () => {
    if (revealed || win.isDestroyed()) return;
    revealed = true;
    try {
      win.setOpacity(1);
    } catch {
      /* ignore */
    }
    win.showInactive();
  };
  win.once("ready-to-show", reveal);
  if (immediate) reveal();
  else setTimeout(reveal, 1800);
  win.loadURL(`${BASE}/pet?id=${encodeURIComponent(id)}`);
  win.on("closed", () => {
    if (track?.win === win) stopTrack();
    stickies.delete(id);
    hiddenStickies.delete(id);
    broadcastPinned();
  });
  stickies.set(id, win);
  hiddenStickies.delete(id);
  return win;
}

function cursorOverMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
    return false;
  }
  const p = cursorPoint();
  const b = mainWindow.getBounds();
  return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
}

function pinAtCursor(id, { snap = true } = {}) {
  stopTrack();
  const existed = stickies.has(id) && !stickies.get(id)?.isDestroyed();
  if (!existed && cursorOverMainWindow()) {
    const pos = defaultPinPos(id);
    placeSticky(id, pos.x, pos.y);
    broadcastPinned();
    return;
  }
  const point = cursorPoint();
  const display = screen.getDisplayNearestPoint(point);
  const pos = snap
    ? snapIfNearTop(point, display)
    : { x: point.x - STICKY_GRAB_X, y: point.y - STICKY_GRAB_Y };
  if (existed && !snap) return;
  placeSticky(id, pos.x, pos.y);
  if (!existed) broadcastPinned();
}

function pinAllTop(ids) {
  const known = new Set(PARTY_ORDER);
  const order = [];
  const seen = new Set();
  const incoming =
    Array.isArray(ids) && ids.length > 0 ? ids : PARTY_ORDER;
  for (const id of incoming) {
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  if (!order.length) order.push(...PARTY_ORDER);
  const area = screen.getPrimaryDisplay().bounds;
  const gap = 6;
  const total = order.length * STICKY_W + (order.length - 1) * gap;
  let x = area.x + Math.max(12, Math.round((area.width - total) / 2));
  const y = area.y;
  for (const id of order) {
    placeSticky(id, x, y);
    x += STICKY_W + gap;
  }
  broadcastPinned();
}

ipcMain.handle("pet:pin", (_event, { id }) => {
  if (typeof id !== "string") return;
  pinAtCursor(id, { snap: true });
  return [...stickies.keys()];
});

ipcMain.on("pet:follow-cursor", (_event, { id }) => {
  if (typeof id !== "string") return;
  const existing = stickies.get(id);
  if (existing && !existing.isDestroyed() && track?.win === existing) return;
  const point = cursorPoint();
  const win = placeSticky(
    id,
    point.x - STICKY_GRAB_X,
    point.y - STICKY_GRAB_Y,
    { clamp: false }
  );
  if (!existing) broadcastPinned();
  startTrack(win, { x: STICKY_GRAB_X, y: STICKY_GRAB_Y }, true);
});

ipcMain.handle("pet:unpin", (_event, { id }) => {
  hiddenStickies.delete(id);
  const win = stickies.get(id);
  if (win && !win.isDestroyed()) win.close();
  return { pinned: [...stickies.keys()], hidden: [...hiddenStickies] };
});

function defaultPinPos(id) {
  const area = screen.getPrimaryDisplay().workArea;
  const idx = Math.max(0, PARTY_ORDER.indexOf(id));
  const gap = 6;
  return {
    x: area.x + 12 + idx * (STICKY_W + gap),
    y: area.y + LEAP_HOP_HEIGHT + 12,
  };
}

function deskOriginPos(id) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    const b = mainWindow.getBounds();
    const idx = Math.max(0, PARTY_ORDER.indexOf(id));
    return {
      x: Math.round(b.x + 28 + idx * 48),
      y: Math.round(b.y + Math.max(24, b.height - STICKY_H - 20)),
    };
  }
  return defaultPinPos(id);
}

function animateLeap(win, x0, y0, x1, y1, done) {
  const area = screen.getDisplayNearestPoint({ x: x0, y: y0 }).workArea;
  const minY = area.y;
  const maxY = area.y + area.height - STICKY_H;
  const start = Date.now();
  const tick = () => {
    if (!win || win.isDestroyed()) {
      done();
      return;
    }
    const t = Math.min(1, (Date.now() - start) / LEAP_DURATION_MS);
    const x = x0 + (x1 - x0) * t;
    const hopPhase = (t * LEAP_HOPS) % 1;
    const rawY =
      y0 + (y1 - y0) * t - Math.sin(hopPhase * Math.PI) * LEAP_HOP_HEIGHT;
    const y = Math.min(maxY, Math.max(minY, rawY));
    win.setPosition(Math.round(x), Math.round(y), false);
    if (t >= 1) {
      done();
      return;
    }
    setTimeout(tick, FRAME_MS);
  };
  setTimeout(tick, FRAME_MS);
}

function shrinkForLeap(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setResizable(false);
    win.setMinimumSize(STICKY_W, STICKY_H);
    stickyMode.set(win, "compact");
    const [x, y] = win.getPosition();
    win.setBounds({ x, y, width: STICKY_W, height: STICKY_H });
  } catch {
    /* ignore */
  }
}

/** @type {Map<string, Promise<unknown>>} */
const leapTail = new Map();

function leapSticky(id, motion) {
  if (typeof id !== "string") {
    return Promise.resolve({
      pinned: [...stickies.keys()],
      hidden: [...hiddenStickies],
    });
  }
  const prev = leapTail.get(id) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => runLeap(id, motion));
  leapTail.set(id, next);
  return next;
}

function runLeap(id, motion) {
  return new Promise((resolve) => {
    const finish = () => {
      leaping.delete(id);
      resolve({
        pinned: [...stickies.keys()],
        hidden: [...hiddenStickies],
      });
    };
    leaping.add(id);
    stopTrack();
    const area = screen.getPrimaryDisplay().workArea;
    const portalX = area.x - STICKY_W;
    let win = stickies.get(id);
    if (win && !win.isDestroyed()) shrinkForLeap(win);

    if (motion === "in") {
      const dest = lastLeapPos.get(id) ?? defaultPinPos(id);
      const startY = Math.max(dest.y, area.y + LEAP_HOP_HEIGHT + 8);
      if (!win || win.isDestroyed()) {
        win = placeSticky(id, portalX, startY, {
          clamp: false,
          immediate: true,
        });
        broadcastPinned();
      } else {
        win.setPosition(Math.round(portalX), Math.round(startY), false);
        try {
          win.setOpacity(1);
        } catch {
          /* ignore */
        }
        win.show();
        hiddenStickies.delete(id);
        broadcastPinned();
      }
      animateLeap(win, portalX, startY, dest.x, startY, () => {
        lastLeapPos.set(id, { x: dest.x, y: startY });
        finish();
      });
      return;
    }

    if (!win || win.isDestroyed()) {
      const start = deskOriginPos(id);
      win = placeSticky(id, start.x, start.y, {
        clamp: false,
        immediate: true,
      });
      broadcastPinned();
    } else if (hiddenStickies.has(id)) {
      win.show();
      hiddenStickies.delete(id);
      broadcastPinned();
    }
    shrinkForLeap(win);
    const b = win.getBounds();
    lastLeapPos.set(id, { x: b.x, y: b.y });
    animateLeap(win, b.x, b.y, portalX, b.y, () => {
      if (win && !win.isDestroyed()) {
        win.hide();
        hiddenStickies.add(id);
        broadcastPinned();
      }
      finish();
    });
  });
}

ipcMain.handle("pet:leap", (_event, { id, motion }) => {
  return leapSticky(id, motion === "in" ? "in" : "out");
});

ipcMain.handle("pet:hide", (_event, { id }) => {
  if (typeof id !== "string") return { pinned: [...stickies.keys()], hidden: [...hiddenStickies] };
  const win = stickies.get(id);
  if (win && !win.isDestroyed()) {
    win.hide();
    hiddenStickies.add(id);
    broadcastPinned();
  }
  return { pinned: [...stickies.keys()], hidden: [...hiddenStickies] };
});

ipcMain.handle("pet:show-sticky", (_event, { id }) => {
  if (typeof id !== "string") return { pinned: [...stickies.keys()], hidden: [...hiddenStickies] };
  const win = stickies.get(id);
  if (win && !win.isDestroyed()) {
    win.show();
    hiddenStickies.delete(id);
    broadcastPinned();
  }
  return { pinned: [...stickies.keys()], hidden: [...hiddenStickies] };
});

ipcMain.handle("pet:pinned", () => ({
  pinned: [...stickies.keys()],
  hidden: [...hiddenStickies],
}));

ipcMain.handle("pet:pin-all-top", async (event, payload = {}) => {
  const confirm = payload?.confirm !== false;
  if (confirm) {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const ja = !app.getLocale().startsWith("en");
    const { response } = await dialog.showMessageBox(parent ?? undefined, {
      type: "info",
      buttons: ja ? ["続ける", "やめる"] : ["Continue", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      message: ja ? "ちょっと重くなるかも" : "This might get heavy",
      detail: ja
        ? "6匹を一度にモニターへ貼ります。窓が多いと、動きが遅くなることがあります。"
        : "All six will stick to the monitor at once. Lots of windows can slow this Mac down.",
    });
    if (response !== 0) {
      return { pinned: [...stickies.keys()], hidden: [...hiddenStickies] };
    }
  }
  pinAllTop(payload?.ids);
  return { pinned: [...stickies.keys()], hidden: [...hiddenStickies] };
});

ipcMain.handle("desk:show", () => {
  createMainWindow();
});

ipcMain.on("pet:drag-begin", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  const p = cursorPoint();
  const b = win.getBounds();
  startTrack(win, { x: p.x - b.x, y: p.y - b.y }, false);
});

ipcMain.on("pet:drag-move", () => {
  applyTrack();
});

ipcMain.on("pet:drag-end", () => {
  stopTrack();
});

ipcMain.handle("pet:resize", (_event, { id, mode }) => {
  if (typeof id !== "string") return;
  if (leaping.has(id)) return;
  const win = stickies.get(id);
  if (!win || win.isDestroyed()) return;
  const next = STICKY_SIZES[mode] ? mode : "compact";
  const size = STICKY_SIZES[next];
  const prev = stickyMode.get(win);
  const grow = STICKY_GROW.has(next);
  win.setResizable(grow);
  if (grow) win.setMinimumSize(260, 240);
  else win.setMinimumSize(STICKY_W, STICKY_H);
  stickyMode.set(win, next);
  const [x, y] = win.getPosition();
  const [, h] = win.getSize();
  const ny =
    y + petTopInWindow(prev || "compact", h) - petTopInWindow(next, size.height);
  win.setBounds({ x, y: ny, width: size.width, height: size.height });
});

ipcMain.handle("desk:notify", (_event, payload = {}) => {
  const title =
    typeof payload.title === "string" ? payload.title : "Ghost Companion";
  const body = typeof payload.body === "string" ? payload.body : "";
  if (!Notification.isSupported()) return false;
  new Notification({ title, body }).show();
  return true;
});

function isSafeHttpUrl(raw) {
  try {
    const u = new URL(String(raw || ""));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

ipcMain.handle("desk:openUrl", async (_event, payload = {}) => {
  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  if (!isSafeHttpUrl(url)) {
    return { ok: false, error: "only http(s) urls allowed" };
  }
  try {
    await shell.openExternal(url);
    return { ok: true, url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "open failed",
    };
  }
});

function screencaptureFile() {
  return new Promise((resolve, reject) => {
    const dest = path.join(
      os.tmpdir(),
      `ghost-companion-shot-${process.pid}-${Date.now()}.png`
    );
    execFile("screencapture", ["-x", "-t", "png", dest], { timeout: 20000 }, (err) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const buf = fs.readFileSync(dest);
        fs.unlink(dest, () => {});
        resolve(buf);
      } catch (readErr) {
        reject(readErr);
      }
    });
  });
}

async function captureScreenPng() {
  try {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;
    const scale = display.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      },
    });
    const primaryId = String(display.id);
    const match =
      sources.find((s) => s.display_id === primaryId) ||
      sources.find((s) => /entire|screen|ディスプレイ|画面/i.test(s.name)) ||
      sources[0];
    if (match?.thumbnail && !match.thumbnail.isEmpty()) {
      return match.thumbnail.toPNG();
    }
  } catch {
    /* fall through */
  }
  if (process.platform === "darwin") {
    return screencaptureFile();
  }
  throw new Error("screenshot unavailable");
}

ipcMain.handle("desk:screenshot", async () => {
  try {
    const png = await captureScreenPng();
    // Shrink for chat/vision: use nativeImage resize.
    let img = nativeImage.createFromBuffer(png);
    const size = img.getSize();
    const maxEdge = 1280;
    const edge = Math.max(size.width, size.height);
    if (edge > maxEdge) {
      const scale = maxEdge / edge;
      img = img.resize({
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
        quality: "better",
      });
    }
    const jpeg = img.toJPEG(72);
    return {
      ok: true,
      mime: "image/jpeg",
      base64: jpeg.toString("base64"),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "screenshot failed",
    };
  }
});

ipcMain.handle("preview:open", async (event, payload = {}) => {
  const id = typeof payload.id === "string" ? payload.id : "";
  const kind = payload.kind === "sheet" ? "sheet" : "image";
  const petId = typeof payload.petId === "string" ? payload.petId : "";
  if (!id) return;
  const key = `${kind}:${id}`;
  const existing = previews.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  const origin = await waitForDesk(senderOrigin(event), 8000);
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 480,
    minHeight: 420,
    backgroundColor: "#f7f8fb",
    title: "Ghost Companion",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  lockToDesk(win);
  const qs = new URLSearchParams({ kind, id });
  if (petId) qs.set("pet", petId);
  const url = `${origin}/preview?${qs.toString()}`;
  win.webContents.on("did-fail-load", (_e, code, _desc, failedUrl) => {
    if (code === -3) return;
    console.error("[ghost-companion] preview failed to load", code, failedUrl);
    void resolveDeskBase(origin).then((next) => {
      if (win.isDestroyed()) return;
      const retry = `${next}/preview?${qs.toString()}`;
      if (retry !== failedUrl) win.loadURL(retry);
    });
  });
  win.loadURL(url);
  win.on("closed", () => {
    if (previews.get(key) === win) previews.delete(key);
  });
  previews.set(key, win);
});

ipcMain.handle("dialog:openDirectory", async (event) => {
  const sender = BrowserWindow.fromWebContents(event.sender);
  const focused = BrowserWindow.getFocusedWindow();
  let parent =
    focused && !focused.isDestroyed()
      ? focused
      : sender && !sender.isDestroyed()
        ? sender
        : undefined;
  if (!parent || !parent.isAlwaysOnTop()) {
    for (const [id, win] of stickies) {
      if (hiddenStickies.has(id) || win.isDestroyed() || !win.isVisible()) {
        continue;
      }
      parent = win;
      break;
    }
  }
  const options = { properties: ["openDirectory", "createDirectory"] };
  const { canceled, filePaths } = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  if (canceled) return null;
  return filePaths[0] ?? null;
});

function liveStickyCount() {
  let n = 0;
  for (const win of stickies.values()) {
    if (!win.isDestroyed()) n += 1;
  }
  return n;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.error(
    "[ghost-companion] Another Ghost Companion window is already running. Focusing that one instead of opening a second."
  );
  app.quit();
} else {
  app.on("second-instance", () => {
    createMainWindow();
  });
}

function closeStickies() {
  stopTrack();
  for (const win of stickies.values()) {
    if (!win.isDestroyed()) win.destroy();
  }
  stickies.clear();
  hiddenStickies.clear();
  for (const win of previews.values()) {
    if (!win.isDestroyed()) win.destroy();
  }
  previews.clear();
}

function allowDeskMedia() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (
      permission === "media" ||
      permission === "microphone" ||
      permission === "audioCapture" ||
      permission === "display-capture"
    ) {
      callback(true);
      return;
    }
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    if (
      permission === "media" ||
      permission === "microphone" ||
      permission === "audioCapture" ||
      permission === "display-capture"
    ) {
      return true;
    }
    return true;
  });
}

/** macOS のマイク設定パネル */
const MIC_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

/**
 * ターミナルから `electron .` で起動すると、TCC（権限）の要求は
 * **親プロセス（ターミナル）に帰属**するため許可ダイアログが出ず、
 * askForMediaAccess が即 false を返して一覧にも Electron が載らない。
 * その場合の案内文（bundle id は開発ビルドだと com.github.Electron）。
 */
const MIC_TERMINAL_HINT =
  "許可ダイアログが出ない場合は、ターミナルからではなくアプリバンドルから起動してください（pnpm run electron:open）。" +
  "一覧に Electron が残っていて直らないときは `tccutil reset Microphone com.github.Electron` を実行してから再起動してください。";

/**
 * マイク権限を要求する。
 * ダイアログを確実に出すため、要求の直前にアプリを前面に出す。
 * @returns {Promise<{ ok: boolean, status: string, prompted: boolean, hint?: string }>}
 */
async function requestMicAccess() {
  if (process.platform !== "darwin") {
    return { ok: true, status: "granted", prompted: false };
  }
  let status = systemPreferences.getMediaAccessStatus("microphone");
  if (status === "granted") return { ok: true, status, prompted: false };

  if (status === "denied" || status === "restricted") {
    // すでに拒否済み。askForMediaAccess はダイアログを出さないので設定画面へ誘導する
    try {
      await shell.openExternal(MIC_SETTINGS_URL);
    } catch (err) {
      console.error("[ghost-companion] open mic settings", err);
    }
    return {
      ok: false,
      status,
      prompted: false,
      hint: `システム設定 > プライバシーとセキュリティ > マイク で Electron（または Ghost Companion）を ON にして、アプリを再起動してください。${MIC_TERMINAL_HINT}`,
    };
  }

  // not-determined / unknown — OS のダイアログを出す
  try {
    app.focus({ steal: true });
  } catch {
    /* 前面化に失敗しても要求自体は試す */
  }
  const allowed = await systemPreferences.askForMediaAccess("microphone");
  status = systemPreferences.getMediaAccessStatus("microphone");
  const ok = allowed || status === "granted";
  if (!ok && status === "not-determined") {
    // ダイアログが出ずに即 false = TCC がターミナルに帰属している
    console.warn(`[ghost-companion] mic prompt did not appear. ${MIC_TERMINAL_HINT}`);
    return { ok: false, status, prompted: false, hint: MIC_TERMINAL_HINT };
  }
  return { ok, status, prompted: true };
}

async function ensureMicAccess() {
  if (process.platform !== "darwin") return true;
  try {
    const before = systemPreferences.getMediaAccessStatus("microphone");
    console.log(`[ghost-companion] mic status → ${before}`);
    const result = await requestMicAccess();
    if (result.status !== before) {
      console.log(`[ghost-companion] mic status → ${result.status}`);
    }
    return result.ok;
  } catch (err) {
    console.error("[ghost-companion] mic permission", err);
    return false;
  }
}

/**
 * 画面収録の TCC 登録を促す。
 * getMediaAccessStatus を読むだけでは一覧に載らないので、
 * 1x1 の getSources を 1 回だけ空打ちして OS に要求を届ける。
 */
async function warmUpScreenAccess() {
  if (process.platform !== "darwin") return;
  try {
    const status = systemPreferences.getMediaAccessStatus("screen");
    console.log(`[ghost-companion] screen status → ${status}`);
    if (status === "granted") return;
    await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1, height: 1 },
    });
    console.log(
      `[ghost-companion] screen status → ${systemPreferences.getMediaAccessStatus("screen")}`
    );
  } catch (err) {
    console.error("[ghost-companion] screen permission warm-up", err);
  }
}

ipcMain.handle("desk:micStatus", async () => {
  if (process.platform !== "darwin") {
    return { ok: true, status: "granted" };
  }
  const status = systemPreferences.getMediaAccessStatus("microphone");
  return { ok: status === "granted", status };
});

ipcMain.handle("desk:requestMic", async () => {
  try {
    return await requestMicAccess();
  } catch (err) {
    return {
      ok: false,
      status: "error",
      prompted: false,
      error: err instanceof Error ? err.message : "mic request failed",
    };
  }
});

ipcMain.handle("desk:openMicSettings", async () => {
  if (process.platform === "darwin") {
    await shell.openExternal(MIC_SETTINGS_URL);
    return true;
  }
  return false;
});

/**
 * Root fix for `OnSizeReceived failed with Error: -2`:
 * Next.js HMR opens chunked streams; canceling them via webRequest made Chromium
 * log -2 every reconnect. Mute HMR in the page world instead (no cancel).
 */
function installPageHmrMute() {
  try {
    session.defaultSession.registerPreloadScript({
      type: "frame",
      id: "ghost-hmr-mute",
      filePath: path.join(__dirname, "page-hmr-mute.js"),
    });
  } catch (err) {
    console.error("[ghost-companion] page HMR mute failed", err);
  }
}

app.commandLine.appendSwitch("log-level", "3");

app.whenReady().then(async () => {
  if (!gotLock) return;
  installPageHmrMute();
  allowDeskMedia();
  if (app.isPackaged) {
    const origin = startPackagedDesk();
    if (origin) {
      BASE = origin;
      process.env.PETASSIST_URL = origin;
      process.env.GHOST_COMPANION_URL = origin;
      await waitForDesk(origin, 45000);
    }
  } else {
    await waitForDesk();
  }
  console.log(`[ghost-companion] desk → ${BASE}`);
  // Next（client/web）から叩く Desktop API を起動する
  try {
    desktopApi = await startDesktopApiServer({ capturePng: captureScreenPng });
  } catch (err) {
    console.error("[ghost-companion] desktop api failed to start", err);
  }
  createMainWindow();
  // 権限ダイアログはウィンドウを出してから要求する（前面のアプリとして扱わせるため）
  const micOk = await ensureMicAccess();
  console.log(`[ghost-companion] microphone → ${micOk ? "ok" : "denied"}`);
  await warmUpScreenAccess();
  // One Obake sticky only — never pin the old Petassist six.
  const pos = defaultPinPos("ghost");
  placeSticky("ghost", pos.x, pos.y);
  broadcastPinned();
  app.on("activate", () => {
    createMainWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  if (desktopApi) {
    desktopApi.close();
    desktopApi = null;
  }
  stopPackagedDesk();
  closeStickies();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
});

app.on("window-all-closed", () => {
  if (liveStickyCount() > 0) return;
  app.quit();
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    app.quit();
  });
}
