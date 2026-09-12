"""Read the running firmware status over USB; never issue a move."""
import json
import time
import serial

connection = serial.Serial(port=None, baudrate=115200, timeout=0.5, write_timeout=3)
connection.dtr = False
connection.rts = False
connection.port = "COM11"
connection.open()
try:
    connection.write(b"\nstatus\n")
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        line = connection.readline().decode("utf-8", errors="replace").strip()
        if not line.startswith("{"):
            continue
        try:
            status = json.loads(line)
        except ValueError:
            continue
        if status.get("type") != "status":
            continue
        assert status["firmware"] == "rail-dc-xyz-1.0", status
        assert not status["standby_pin_high"], status
        assert all(not a["active"] and not a["pending"] for a in status["axes"]), status
        assert status["http_port"] == 80, status
        print(json.dumps(status, ensure_ascii=False))
        print("PASS: DC firmware responding; all axes stopped and STBY LOW")
        break
    else:
        raise SystemExit("No DC firmware status received")
finally:
    connection.close()
