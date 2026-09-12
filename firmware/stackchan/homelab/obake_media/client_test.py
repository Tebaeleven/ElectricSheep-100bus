#!/usr/bin/env python3
# 端末待ち受け Robot WS の簡易確認クライアント
# 使い方: python client_test.py obake.local  または  python client_test.py <端末IP>
from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

try:
    import aiohttp
except ImportError as e:
    raise SystemExit("pip install aiohttp") from e

PORT = 8765
PATH = "/ws/v1/robot"
OUT = Path(__file__).resolve().parent / "captured.jpg"


async def main(host: str) -> None:
    url = f"ws://{host}:{PORT}{PATH}"
    print("connect", url)
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(url, heartbeat=20) as ws:
            # connect ack
            msg = await asyncio.wait_for(ws.receive(), timeout=5)
            print("<<", msg.type, msg.data if msg.type == aiohttp.WSMsgType.TEXT else f"bin {len(msg.data)}B")

            await ws.send_str(json.dumps({"type": "hand.set", "open": True}))
            print(">> hand.set")
            print("<<", (await asyncio.wait_for(ws.receive(), timeout=5)).data)

            await ws.send_str(json.dumps({"type": "camera.capture"}))
            print(">> camera.capture")
            # ack and/or frame (order may vary)
            got_frame = False
            for _ in range(4):
                msg = await asyncio.wait_for(ws.receive(), timeout=8)
                if msg.type == aiohttp.WSMsgType.TEXT:
                    print("<<", msg.data)
                elif msg.type == aiohttp.WSMsgType.BINARY and len(msg.data) > 1 and msg.data[0] == 0x02:
                    OUT.write_bytes(msg.data[1:])
                    print(f"<< camera.frame {len(msg.data)-1}B -> {OUT}")
                    got_frame = True
            if not got_frame:
                print("WARN: no camera.frame")

            await ws.send_str(json.dumps({"type": "audio.start"}))
            print(">> audio.start")
            print("<<", (await asyncio.wait_for(ws.receive(), timeout=5)).data)
            chunks = 0
            bytes_ = 0
            t0 = time.time()
            while time.time() - t0 < 3.0:
                msg = await asyncio.wait_for(ws.receive(), timeout=3)
                if msg.type == aiohttp.WSMsgType.BINARY and len(msg.data) > 1 and msg.data[0] == 0x01:
                    chunks += 1
                    bytes_ += len(msg.data) - 1
            print(f"<< audio.chunk x{chunks} ({bytes_} bytes in ~3s)")
            await ws.send_str(json.dumps({"type": "audio.stop"}))
            print(">> audio.stop")
            print("<<", (await asyncio.wait_for(ws.receive(), timeout=5)).data)
            print("DONE")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python client_test.py <device-ip-or-obake.local>")
        sys.exit(2)
    asyncio.run(main(sys.argv[1]))
