"""Provision rail DC firmware without printing credentials."""
import argparse
import json
from pathlib import Path
import time

import serial


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", default="COM11")
    parser.add_argument("--file", required=True)
    parser.add_argument("--ca", required=True, help="Root CA certificate PEM file")
    args = parser.parse_args()
    config = json.loads(Path(args.file).read_text(encoding="utf-8-sig"))
    config["root_ca"] = Path(args.ca).read_text(encoding="utf-8-sig")
    config["op"] = "configure"
    payload = json.dumps(config, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(payload) > 8192:
        raise SystemExit("Configuration exceeds firmware line limit")
    connection = serial.Serial(port=None, baudrate=115200, timeout=0.5, write_timeout=5)
    connection.dtr = False
    connection.rts = False
    connection.port = args.port
    connection.open()
    try:
        time.sleep(0.5)
        connection.reset_input_buffer()
        connection.write(payload + b"\n")
        connection.flush()
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            line = connection.readline()
            if b"Configuration saved;" in line:
                print("Configuration saved. ESP32 is restarting with outputs stopped.")
                return
            if b"Configuration rejected" in line or b"save failed" in line:
                raise SystemExit("ESP32 rejected configuration or could not save it")
        raise SystemExit("No save acknowledgement received; configuration is unconfirmed")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
