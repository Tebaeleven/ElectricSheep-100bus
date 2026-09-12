"""Run on the external central server: uvicorn server.app:app --workers 1."""
import asyncio
import hmac
import json
import math
import os
import time
from collections import OrderedDict
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, ValidationError

Axis = Literal["X", "Y", "Z"]
Direction = Literal["increase", "decrease"]
TERMINAL = {"completed", "stopped", "superseded", "failed", "unknown"}


class Move(BaseModel):
    model_config = ConfigDict(extra="forbid")
    axis: Axis
    direction: Direction
    seconds: Annotated[float, Field(strict=True, ge=0.001, le=60, allow_inf_nan=False)]


class Stop(BaseModel):
    model_config = ConfigDict(extra="forbid")
    axis: Axis | None = None


class Hello(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["hello"]
    device_id: str
    axes: list[Axis] = Field(min_length=1, max_length=3)
    simulated: bool = False


class Event(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["event"]
    command_id: str = Field(min_length=1, max_length=64)
    status: Literal["started", "completed", "stopped", "failed"]
    message: str | None = Field(default=None, max_length=256)


@dataclass(frozen=True)
class Settings:
    api_token: str
    device_token: str
    device_id: str = "rail-1"
    heartbeat_timeout: float = 3.0
    command_ttl_ms: int = 2000
    allow_simulated: bool = False

    @classmethod
    def environment(cls):
        api = os.environ.get("RAIL_API_TOKEN", "")
        device = os.environ.get("RAIL_DEVICE_TOKEN", "")
        if len(api) < 24 or len(device) < 24 or api == device:
            raise RuntimeError("Set different RAIL_API_TOKEN and RAIL_DEVICE_TOKEN values, each at least 24 characters")
        return cls(api, device, os.environ.get("RAIL_DEVICE_ID", "rail-1"),
                   allow_simulated=os.environ.get("RAIL_ALLOW_SIMULATED") == "1")


def now_ms():
    return int(time.time() * 1000)


class Broker:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.ws: WebSocket | None = None
        self.axes: set[str] = set()
        self.simulated = False
        self.last_seen = 0.0
        self.records: OrderedDict[str, dict] = OrderedDict()
        self.latest: dict[str, str] = {}
        self.send_lock = asyncio.Lock()
        self.session = 0

    def connected(self):
        return self.ws is not None and time.monotonic() - self.last_seen < self.settings.heartbeat_timeout

    def state(self):
        return {"device_id": self.settings.device_id, "connected": self.connected(),
                "simulated": self.simulated, "supported_axes": sorted(self.axes),
                "position": None, "position_source": "no_position_sensor",
                "axes": {axis: self.records.get(self.latest.get(axis, "")) for axis in ("X", "Y", "Z")}}

    def invalidate(self):
        for record in self.records.values():
            if record["status"] not in TERMINAL:
                record.update(status="unknown", message="Device connection lost; physical state unconfirmed")

    async def detach(self, ws):
        if self.ws is ws:
            self.ws = None
            self.axes = set()
            self.invalidate()

    async def dispatch(self, kind: str, axis: str | None, direction=None, seconds=None):
        async with self.send_lock:
            if not self.connected():
                raise HTTPException(503, "ESP32 is offline; command was not queued")
            if axis is not None and axis not in self.axes:
                raise HTTPException(409, f"Axis {axis} is not configured on the device")
            duration = math.ceil(seconds * 1000) if seconds is not None else None
            command_id = str(uuid4())
            issued = now_ms()
            affected = list(self.axes) if axis is None else [axis]
            replaces = [self.latest[a] for a in affected if a in self.latest]
            record = {"command_id": command_id, "device_id": self.settings.device_id,
                      "type": kind, "axis": axis, "direction": direction, "duration_ms": duration,
                      "status": "sent", "issued_at_ms": issued,
                      "expires_at_ms": issued + self.settings.command_ttl_ms,
                      "replaces": replaces, "simulated": self.simulated}
            self.records[command_id] = record
            while len(self.records) > 1000:
                # Never remove an active command just to retain old history.
                removable = next((key for key, item in self.records.items()
                                  if item["status"] in TERMINAL and key not in self.latest.values()), None)
                if removable is None:
                    self.records.pop(command_id)
                    raise HTTPException(429, "Too many unconfirmed commands; wait for device acknowledgements")
                self.records.pop(removable)
            packet = {key: record[key] for key in ("command_id", "type", "axis", "issued_at_ms", "expires_at_ms")}
            packet["replace"] = True
            if kind == "move":
                packet.update(direction=1 if direction == "increase" else -1, duration_ms=duration)
            ws = self.ws
            try:
                await asyncio.wait_for(ws.send_json(packet), timeout=1)
            except (RuntimeError, OSError, asyncio.TimeoutError):
                record.update(status="unknown", message="Delivery could not be confirmed")
                await self.detach(ws)
                raise HTTPException(503, {"command_id": command_id, "message": "Device delivery failed; do not blindly retry"})
            for a in affected:
                self.latest[a] = command_id
            return dict(record)

    def event(self, event: Event):
        record = self.records.get(event.command_id)
        if not record or record["status"] in TERMINAL:
            return
        allowed = {"started", "completed", "failed"} if record["type"] == "move" else {"stopped", "failed"}
        if event.status not in allowed:
            return
        record.update(status=event.status, acknowledged_at_ms=now_ms())
        if event.message:
            record["message"] = event.message
        if event.status in {"started", "completed", "stopped"}:
            for old_id in record["replaces"]:
                old = self.records.get(old_id)
                if old and old["status"] not in TERMINAL:
                    old["status"] = "stopped" if record["type"] == "stop" else "superseded"

    async def monitor(self):
        while True:
            await asyncio.sleep(0.2)
            if self.ws is not None and not self.connected():
                ws = self.ws
                await self.detach(ws)
                with suppress(Exception):
                    await asyncio.wait_for(ws.close(code=1001), 1)
            for record in self.records.values():
                if record["status"] in TERMINAL:
                    continue
                allowance = (record["duration_ms"] or 0) + 3000
                if now_ms() > record["expires_at_ms"] + allowance:
                    record.update(status="unknown", message="No completion confirmation; physical state unconfirmed")


def create_app(settings: Settings | None = None):
    @asynccontextmanager
    async def lifespan(app):
        broker = Broker(settings or Settings.environment())
        app.state.broker = broker
        monitor = asyncio.create_task(broker.monitor())
        yield
        monitor.cancel()
        with suppress(asyncio.CancelledError):
            await monitor
        if broker.ws is not None:
            with suppress(Exception):
                await broker.ws.close(code=1001)

    api = FastAPI(title="Monorail XYZ Control API", version="1.0.0", lifespan=lifespan,
                  description="外部中央サーバーからX/Y/Zを方向と秒数で操作します。秒数は移動距離ではありません。")
    bearer = HTTPBearer(auto_error=False)

    async def authorize(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        expected = api.state.broker.settings.api_token
        if credentials is None or not hmac.compare_digest(credentials.credentials.encode(), expected.encode()):
            raise HTTPException(401, "Invalid API token", headers={"WWW-Authenticate": "Bearer"})

    @api.get("/healthz")
    async def health():
        return {"ok": True}

    @api.post("/api/v1/move", status_code=202, dependencies=[Depends(authorize)])
    async def move(body: Move):
        """指定軸を増加／減少方向へ指定秒数だけ動かす。同じ軸の前の動作を置換。"""
        return await api.state.broker.dispatch("move", body.axis, body.direction, body.seconds)

    @api.post("/api/v1/stop", status_code=202, dependencies=[Depends(authorize)])
    async def stop(body: Stop):
        """axisを指定するとその軸、{}なら全軸を停止。"""
        return await api.state.broker.dispatch("stop", body.axis)

    @api.get("/api/v1/status", dependencies=[Depends(authorize)])
    async def status():
        return api.state.broker.state()

    @api.get("/api/v1/commands/{command_id}", dependencies=[Depends(authorize)])
    async def command(command_id: str):
        record = api.state.broker.records.get(command_id)
        if record is None:
            raise HTTPException(404, "Command not found or history expired")
        return record

    @api.websocket("/ws/device")
    async def device(ws: WebSocket):
        broker = api.state.broker
        expected = f"Bearer {broker.settings.device_token}".encode()
        if not hmac.compare_digest(ws.headers.get("authorization", "").encode(), expected):
            await ws.close(code=4401)
            return
        await ws.accept()
        try:
            text = await asyncio.wait_for(ws.receive_text(), 5)
            if len(text) > 4096:
                await ws.close(code=1009)
                return
            hello = Hello.model_validate_json(text)
            if (hello.device_id != broker.settings.device_id or len(set(hello.axes)) != len(hello.axes)
                    or (hello.simulated and not broker.settings.allow_simulated)):
                await ws.close(code=4403)
                return
            if broker.ws is not None:
                await ws.close(code=4409)
                return
            broker.ws = ws
            broker.session += 1
            broker.axes = set(hello.axes)
            broker.simulated = hello.simulated
            broker.last_seen = time.monotonic()
            await ws.send_json({"type": "welcome", "server_time_ms": now_ms(),
                                "heartbeat_interval_ms": 1000, "watchdog_ms": 2000})
            while True:
                text = await ws.receive_text()
                if len(text) > 4096:
                    await ws.close(code=1009)
                    break
                message = json.loads(text)
                if not isinstance(message, dict):
                    raise ValueError("Object required")
                if message.get("type") == "heartbeat":
                    broker.last_seen = time.monotonic()
                    async with broker.send_lock:
                        await ws.send_json({"type": "heartbeat", "server_time_ms": now_ms()})
                else:
                    event = Event.model_validate(message)
                    broker.last_seen = time.monotonic()
                    broker.event(event)
        except (WebSocketDisconnect, RuntimeError, asyncio.TimeoutError):
            pass
        except (ValidationError, ValueError):
            with suppress(Exception):
                await ws.close(code=1008)
        finally:
            await broker.detach(ws)

    return api


app = create_app()
