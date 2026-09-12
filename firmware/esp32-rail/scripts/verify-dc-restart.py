"""Verify AP settings persist across an ESP32 reset without moving motors."""
import json
import time
import serial


def read_json(port, command, key):
    port.reset_input_buffer()
    port.write(command + b"\n")
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        try:
            value = json.loads(port.readline())
        except (ValueError, UnicodeDecodeError):
            continue
        if isinstance(value, dict) and key in value:
            return value
    raise RuntimeError("Firmware did not respond to serial query")


port = serial.Serial(port=None, baudrate=115200, timeout=0.5, write_timeout=3)
port.dtr = False
port.rts = False
port.port = "COM11"
port.open()
try:
    first = read_json(port, b"access", "ssid")
    port.rts = True
    time.sleep(0.15)
    port.rts = False
    time.sleep(3)
    second = read_json(port, b"access", "ssid")
    assert first == second, "AP credentials changed on restart"
    status = read_json(port, b"status", "firmware")
    assert status["ap_ip"] == "192.168.4.1", status
    assert status["http_port"] == 80, status
    assert not status["standby_pin_high"], status
    assert all(not a["active"] and not a["pending"] for a in status["axes"]), status
    print(json.dumps(status))
    print("PASS: AP restarted, credentials persisted, all motor outputs stopped")
finally:
    port.close()
