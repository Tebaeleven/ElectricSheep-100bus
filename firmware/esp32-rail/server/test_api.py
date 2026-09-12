import time
import unittest

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from server.app import Settings, create_app


SETTINGS = Settings("test-api-token-123456789012345", "test-device-token-1234567890")
AUTH = {"Authorization": "Bearer " + SETTINGS.api_token}
DEVICE_AUTH = {"Authorization": "Bearer " + SETTINGS.device_token}


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.context = TestClient(create_app(SETTINGS))
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)

    def device(self):
        return self.client.websocket_connect("/ws/device", headers=DEVICE_AUTH)

    def hello(self, ws, axes=None, **extra):
        ws.send_json({"type": "hello", "device_id": "rail-1", "axes": axes or ["X", "Y", "Z"], **extra})
        return ws.receive_json()

    def move(self, axis="X", direction="increase", seconds=3):
        return self.client.post("/api/v1/move", headers=AUTH,
                                json={"axis": axis, "direction": direction, "seconds": seconds})

    def record(self, command_id):
        return self.client.get(f"/api/v1/commands/{command_id}", headers=AUTH).json()

    def await_status(self, command_id, status):
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            record = self.record(command_id)
            if record["status"] == status:
                return record
            time.sleep(0.01)
        self.fail(f"Expected {status}, received {record}")

    def test_auth_and_offline_no_queue(self):
        self.assertEqual(self.client.post("/api/v1/move", json={}).status_code, 401)
        self.assertEqual(self.move().status_code, 503)
        self.assertEqual(len(self.client.app.state.broker.records), 0)
        self.assertFalse(self.client.get("/api/v1/status", headers=AUTH).json()["connected"])
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/ws/device"):
                pass

    def test_seconds_axes_and_direction_validation(self):
        for seconds in [0, -1, 60.001, True, "3", None, 0.0001]:
            with self.subTest(seconds=seconds):
                self.assertEqual(self.move(seconds=seconds).status_code, 422)
        self.assertEqual(self.move(axis="A").status_code, 422)
        self.assertEqual(self.move(direction="right").status_code, 422)
        body = {"axis": "X", "direction": "increase", "seconds": 3, "position": 100}
        self.assertEqual(self.client.post("/api/v1/move", headers=AUTH, json=body).status_code, 422)

    def test_forward_reverse_all_axes_and_completed_event(self):
        with self.device() as ws:
            self.assertEqual(self.hello(ws)["watchdog_ms"], 2000)
            for axis in ("X", "Y", "Z"):
                for direction, sign in (("increase", 1), ("decrease", -1)):
                    response = self.move(axis, direction)
                    self.assertEqual(response.status_code, 202)
                    receipt = response.json()
                    self.assertEqual(receipt["status"], "sent")
                    packet = ws.receive_json()
                    self.assertEqual(packet["axis"], axis)
                    self.assertEqual(packet["direction"], sign)
                    self.assertEqual(packet["duration_ms"], 3000)
                    self.assertEqual(packet["expires_at_ms"] - packet["issued_at_ms"], 2000)
                    ws.send_json({"type": "event", "command_id": packet["command_id"], "status": "started"})
                    self.await_status(packet["command_id"], "started")
                    ws.send_json({"type": "event", "command_id": packet["command_id"], "status": "completed"})
                    self.await_status(packet["command_id"], "completed")

    def test_replacement_is_axis_local_and_old_events_do_not_resurrect(self):
        with self.device() as ws:
            self.hello(ws)
            x1 = self.move("X").json()["command_id"]
            ws.receive_json()
            y1 = self.move("Y").json()["command_id"]
            ws.receive_json()
            x2 = self.move("X", "decrease", 0.125).json()["command_id"]
            packet = ws.receive_json()
            self.assertEqual(packet["duration_ms"], 125)
            self.assertEqual(self.record(x2)["replaces"], [x1])
            ws.send_json({"type": "event", "command_id": x2, "status": "started"})
            self.await_status(x1, "superseded")
            self.assertEqual(self.record(y1)["status"], "sent")
            ws.send_json({"type": "event", "command_id": x1, "status": "started"})
            ws.send_json({"type": "heartbeat"})
            self.assertEqual(ws.receive_json()["type"], "heartbeat")
            self.assertEqual(self.record(x1)["status"], "superseded")

    def test_stop_one_and_all_waits_for_ack(self):
        with self.device() as ws:
            self.hello(ws)
            x = self.move("X").json()["command_id"]
            ws.receive_json()
            y = self.move("Y").json()["command_id"]
            ws.receive_json()
            result = self.client.post("/api/v1/stop", headers=AUTH, json={"axis": "X"})
            self.assertEqual(result.status_code, 202)
            stop_x = ws.receive_json()
            self.assertEqual(stop_x["axis"], "X")
            self.assertEqual(self.record(x)["status"], "sent")
            ws.send_json({"type": "event", "command_id": stop_x["command_id"], "status": "stopped"})
            self.await_status(x, "stopped")
            self.assertEqual(self.record(y)["status"], "sent")
            self.client.post("/api/v1/stop", headers=AUTH, json={})
            stop_all = ws.receive_json()
            self.assertIsNone(stop_all["axis"])
            ws.send_json({"type": "event", "command_id": stop_all["command_id"], "status": "stopped"})
            self.await_status(y, "stopped")

    def test_capabilities_and_simulator_rejection(self):
        with self.device() as ws:
            self.hello(ws, ["X"])
            self.assertEqual(self.move("Z").status_code, 409)
        with self.device() as ws:
            ws.send_json({"type": "hello", "device_id": "rail-1", "axes": ["X"], "simulated": True})
            with self.assertRaises(WebSocketDisconnect):
                ws.receive_json()

    def test_disconnect_and_reconnect_do_not_replay(self):
        with self.device() as ws:
            self.hello(ws)
            command_id = self.move().json()["command_id"]
            ws.receive_json()
        self.await_status(command_id, "unknown")
        self.assertEqual(self.move().status_code, 503)
        with self.device() as ws:
            self.hello(ws)
            ws.send_json({"type": "heartbeat"})
            self.assertEqual(ws.receive_json()["type"], "heartbeat")
            self.assertEqual(self.record(command_id)["status"], "unknown")

    def test_device_heartbeat_timeout(self):
        settings = Settings(SETTINGS.api_token, SETTINGS.device_token, heartbeat_timeout=0.25)
        with TestClient(create_app(settings)) as client:
            with client.websocket_connect("/ws/device", headers=DEVICE_AUTH) as ws:
                self.hello(ws)
                response = client.post("/api/v1/move", headers=AUTH,
                                       json={"axis": "X", "direction": "increase", "seconds": 3})
                ws.receive_json()
                time.sleep(0.6)
                self.assertFalse(client.get("/api/v1/status", headers=AUTH).json()["connected"])
                record = client.get("/api/v1/commands/" + response.json()["command_id"], headers=AUTH).json()
                self.assertEqual(record["status"], "unknown")

    def test_duplicate_device_rejected_and_first_connection_preserved(self):
        with self.device() as first:
            self.hello(first)
            with self.device() as second:
                second.send_json({"type": "hello", "device_id": "rail-1", "axes": ["X"]})
                with self.assertRaises(WebSocketDisconnect):
                    second.receive_json()
            self.assertEqual(self.move().status_code, 202)
            self.assertEqual(first.receive_json()["type"], "move")

    def test_malformed_device_message_and_unknown_command(self):
        self.assertEqual(self.client.get("/api/v1/commands/missing", headers=AUTH).status_code, 404)
        with self.device() as ws:
            self.hello(ws)
            ws.send_text("[]")
            with self.assertRaises(WebSocketDisconnect):
                ws.receive_json()

    def test_openapi_exposes_http_contract(self):
        schema = self.client.get("/openapi.json").json()
        self.assertIn("post", schema["paths"]["/api/v1/move"])
        self.assertIn("HTTPBearer", schema["components"]["securitySchemes"])
        self.assertEqual(self.client.get("/docs").status_code, 200)


if __name__ == "__main__":
    unittest.main()
