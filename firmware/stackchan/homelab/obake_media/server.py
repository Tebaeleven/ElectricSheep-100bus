#!/usr/bin/env python3
# Obake Media: 端末 WS から JPEG/PCM を受け、AI 向け HTTP（latest.jpg / status）を提供する。
from __future__ import annotations

import asyncio
import json
import struct
import sys
import time
from pathlib import Path

try:
    from aiohttp import WSMsgType, web
except ImportError as e:
    raise SystemExit("pip install aiohttp が必要です（例: python -m pip install aiohttp）") from e

HOST = "0.0.0.0"
PORT = 8030
TYPE_JPEG = 0x02
TYPE_PCM = 0x20
# この秒数 JPEG も PCM も来なければゾンビ WS とみなして切断（画面が古いまま残るのを防ぐ）
STALE_WS_SEC = 15.0

ROOT = Path(__file__).resolve().parent
LATEST_JPG = ROOT / "latest.jpg"

connected = False
pcm_rate = 24000
jpeg_count = 0
pcm_count = 0
jpeg_bytes = 0
pcm_bytes = 0
last_jpeg_ts = 0.0
last_pcm_ts = 0.0
last_any_ts = 0.0
latest_jpeg = b""
last_pcm_rms = 0.0
active_ws: web.WebSocketResponse | None = None

# ブラウザ／中間キャッシュで同じ URL が古いまま出ないようにする
NO_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
}


def log(msg: str) -> None:
    print(msg, flush=True)


def pcm_rms(payload: bytes) -> float:
    if len(payload) < 2:
        return 0.0
    n = len(payload) // 2
    total = 0.0
    for i in range(n):
        (sample,) = struct.unpack_from("<h", payload, i * 2)
        total += float(sample * sample)
    return (total / max(n, 1)) ** 0.5


def status_dict() -> dict:
    now = time.time()
    jpeg_age = (now - last_jpeg_ts) if last_jpeg_ts else None
    pcm_age = (now - last_pcm_ts) if last_pcm_ts else None
    fps = 0.0
    if jpeg_age is not None and jpeg_age < 1.5:
        fps = 1.0 / max(jpeg_age, 0.05)
    return {
        "connected": connected,
        "pcm_rate": pcm_rate,
        "jpeg_count": jpeg_count,
        "pcm_count": pcm_count,
        "jpeg_bytes": jpeg_bytes,
        "pcm_bytes": pcm_bytes,
        "last_jpeg_age_sec": jpeg_age,
        "last_pcm_age_sec": pcm_age,
        "approx_jpeg_fps": round(fps, 2),
        "last_pcm_rms": round(last_pcm_rms, 1),
        "latest_jpeg_size": len(latest_jpeg),
        "primary_frame_url": "/obake/latest.jpg",
    }


async def stale_watchdog() -> None:
    """上行が止まった半開き WS を閉じ、connected が偽陽性のまま残らないようにする。"""
    global connected, active_ws
    while True:
        await asyncio.sleep(2.0)
        ws = active_ws
        if ws is None or ws.closed:
            continue
        if not last_any_ts:
            continue
        age = time.time() - last_any_ts
        if age < STALE_WS_SEC:
            continue
        log(f"[ws] stale {age:.1f}s without media — closing zombie connection")
        try:
            await ws.close(code=1001, message=b"stale media")
        except Exception as e:
            log(f"[ws] stale close err: {e}")
        if active_ws is ws:
            active_ws = None
            connected = False


async def handle_media_ws(request: web.Request) -> web.WebSocketResponse:
    global connected, active_ws, pcm_rate, jpeg_count, pcm_count
    global jpeg_bytes, pcm_bytes, last_jpeg_ts, last_pcm_ts, last_any_ts, latest_jpeg, last_pcm_rms

    # 旧接続が残っていても新端末を優先（ゾンビを上書き）
    prev = active_ws
    if prev is not None and not prev.closed:
        log("[ws] replacing previous client")
        try:
            await prev.close(code=1001, message=b"replaced")
        except Exception:
            pass

    ws = web.WebSocketResponse(max_msg_size=2 * 1024 * 1024, heartbeat=20.0)
    await ws.prepare(request)
    log("[ws] client connected")
    connected = True
    active_ws = ws
    last_any_ts = time.time()
    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                text = msg.data
                log(f"[ws] text: {text[:200]}")
                try:
                    doc = json.loads(text)
                    if doc.get("type") == "hello" and "pcm_rate" in doc:
                        pcm_rate = int(doc["pcm_rate"])
                        last_any_ts = time.time()
                except json.JSONDecodeError:
                    pass
            elif msg.type == WSMsgType.BINARY:
                data = msg.data
                if len(data) < 5:
                    continue
                msg_type = data[0]
                (payload_len,) = struct.unpack(">I", data[1:5])
                payload = bytes(data[5 : 5 + payload_len])
                if msg_type == TYPE_JPEG:
                    jpeg_count += 1
                    jpeg_bytes += len(payload)
                    last_jpeg_ts = time.time()
                    last_any_ts = last_jpeg_ts
                    latest_jpeg = payload
                    try:
                        LATEST_JPG.write_bytes(payload)
                    except OSError as e:
                        log(f"[warn] write latest.jpg: {e}")
                elif msg_type == TYPE_PCM:
                    pcm_count += 1
                    pcm_bytes += len(payload)
                    last_pcm_ts = time.time()
                    last_any_ts = last_pcm_ts
                    last_pcm_rms = pcm_rms(payload)
                else:
                    log(f"[ws] unknown type=0x{msg_type:02x} len={payload_len}")
            elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                break
    finally:
        log("[ws] client disconnected")
        if active_ws is ws:
            active_ws = None
            connected = False
    return ws


async def handle_root(_: web.Request) -> web.Response:
    # 画面確認も AI と同じ latest.jpg に寄せる（専用 view UI は廃止）
    raise web.HTTPFound("/obake/latest.jpg")


async def handle_view_gone(_: web.Request) -> web.Response:
    # 旧 /obake/view はリダイレクト。ドキュメントは latest.jpg + status を正とする
    raise web.HTTPFound("/obake/latest.jpg")


async def handle_status(_: web.Request) -> web.Response:
    return web.json_response(status_dict(), headers=NO_CACHE)


async def handle_latest(_: web.Request) -> web.Response:
    if not latest_jpeg:
        # プロセス再起動直後はメモリ空でもディスクに残っていれば返す
        if LATEST_JPG.is_file():
            try:
                body = LATEST_JPG.read_bytes()
                if body:
                    return web.Response(body=body, content_type="image/jpeg", headers=NO_CACHE)
            except OSError:
                pass
        return web.Response(status=404, text="no jpeg yet", headers=NO_CACHE)
    return web.Response(body=latest_jpeg, content_type="image/jpeg", headers=NO_CACHE)


async def handle_servo(request: web.Request) -> web.Response:
    try:
        doc = await request.json()
    except Exception:
        doc = {}
    cmd = {
        "cmd": "set_head",
        "yaw": int(doc.get("yaw", 0)),
        "pitch": int(doc.get("pitch", 0)),
        "speed": int(doc.get("speed", 150)),
    }
    ws = active_ws
    if ws is None or ws.closed:
        return web.json_response({"ok": False, "error": "device not connected"}, status=503, headers=NO_CACHE)
    await ws.send_str(json.dumps(cmd))
    return web.json_response({"ok": True, "sent": cmd}, headers=NO_CACHE)


async def on_startup(app: web.Application) -> None:
    app["stale_task"] = asyncio.create_task(stale_watchdog())


async def on_cleanup(app: web.Application) -> None:
    task = app.get("stale_task")
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def main() -> None:
    # 標準出力がパイプでもすぐ見えるようにする
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass

    app = web.Application()
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    app.router.add_get("/", handle_root)
    app.router.add_get("/obake/view", handle_view_gone)
    app.router.add_get("/obake/status", handle_status)
    app.router.add_get("/obake/latest.jpg", handle_latest)
    app.router.add_post("/obake/servo", handle_servo)
    app.router.add_get("/obake/media", handle_media_ws)
    log(f"[obake_media] primary: http://127.0.0.1:{PORT}/obake/latest.jpg")
    log(f"[obake_media] status:  http://127.0.0.1:{PORT}/obake/status")
    log(f"[obake_media] ws:      ws://0.0.0.0:{PORT}/obake/media")
    log(f"[obake_media] note: /obake/view and / redirect to /obake/latest.jpg")
    web.run_app(app, host=HOST, port=PORT, print=None)


if __name__ == "__main__":
    main()
