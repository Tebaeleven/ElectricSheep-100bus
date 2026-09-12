"""Temporarily connect to the ESP32 AP, exercise HTTP LED preview, restore Wi-Fi."""
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
import xml.etree.ElementTree as ET
import serial

BASE = "http://192.168.4.1"
INTERFACE = "Wi-Fi"
ORIGINAL_PROFILE = "meitetsu-inn"
PROFILE = "Codex-Rail-LED-Demo"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def netsh(*args):
    result = subprocess.run(["netsh", "wlan", *args], capture_output=True, check=True)
    print(result.stdout.decode(errors="replace"), flush=True)
    return result


def request(path, data=None):
    payload = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(BASE + path, data=payload,
                                 headers={"Content-Type": "application/json"})
    with opener.open(req, timeout=3) as response:
        return response.status, json.load(response)


port = serial.Serial(port=None, baudrate=115200, timeout=0.5, write_timeout=3)
port.dtr = False
port.rts = False
port.port = "COM11"
port.open()
try:
    port.reset_input_buffer()
    port.write(b"\naccess\n")
    deadline = time.monotonic() + 8
    access = None
    while time.monotonic() < deadline:
        try:
            value = json.loads(port.readline())
        except (ValueError, UnicodeDecodeError):
            continue
        if "ssid" in value and "password" in value:
            access = value
            break
    if access is None:
        raise RuntimeError("ESP32 did not provide AP credentials")
finally:
    port.close()

ns = "http://www.microsoft.com/networking/WLAN/profile/v1"
ET.register_namespace("", ns)
root = ET.Element("{" + ns + "}WLANProfile")


def element(parent, tag, text=None):
    node = ET.SubElement(parent, "{" + ns + "}" + tag)
    node.text = text
    return node


element(root, "name", PROFILE)
ssid_config = element(root, "SSIDConfig")
ssid = element(ssid_config, "SSID")
element(ssid, "name", access["ssid"])
element(root, "connectionType", "ESS")
element(root, "connectionMode", "manual")
security = element(element(root, "MSM"), "security")
auth = element(security, "authEncryption")
element(auth, "authentication", "WPA2PSK")
element(auth, "encryption", "AES")
element(auth, "useOneX", "false")
key = element(security, "sharedKey")
element(key, "keyType", "passPhrase")
element(key, "protected", "false")
element(key, "keyMaterial", access["password"])
report = []
added = False
try:
    with tempfile.TemporaryDirectory(prefix="rail-led-") as folder:
        profile_file = Path(folder) / "profile.xml"
        ET.ElementTree(root).write(profile_file, encoding="utf-8", xml_declaration=True)
        netsh("add", "profile", "filename=" + str(profile_file), "user=current")
        added = True
    netsh("disconnect", "interface=" + INTERFACE)
    time.sleep(1)
    netsh("connect", "name=" + PROFILE, "ssid=" + access["ssid"], "interface=" + INTERFACE)
    time.sleep(4)
    netsh("show", "interfaces")
    deadline = time.monotonic() + 25
    while True:
        try:
            code, status = request("/api/v1/rail/status")
            assert status["mode"] == "led_preview", "Refusing demo with motor outputs enabled"
            assert status["rgb_led_ready"] and not status["http_auth_required"]
            break
        except (OSError, ValueError):
            if time.monotonic() >= deadline:
                raise RuntimeError("Could not reach ESP32 HTTP server")
            time.sleep(0.5)
    print("Connected; unauthenticated GET status succeeded", flush=True)
    for axis, direction, expected in [("x", 1, [40, 0, 0]), ("y", 1, [0, 40, 0]),
                                      ("z", 1, [0, 0, 40]), ("z", -1, None)]:
        code, result = request("/api/v1/rail/move", {"axis": axis, "direction": direction, "duration_ms": 3000})
        assert code == 202 and result["status"] == "accepted", result
        start = time.monotonic()
        colors = set()
        while time.monotonic() - start < 3.3:
            _, status = request("/api/v1/rail/status")
            colors.add(tuple(status["led_rgb"]))
            assert not status["standby_pin_high"], status
            time.sleep(0.1)
        assert not any(a["active"] or a["pending"] for a in status["axes"]), status
        assert tuple(expected or [0, 0, 40]) in colors, colors
        assert (0, 0, 0) in colors, colors
        entry = {"axis": axis, "direction": direction, "accepted": True,
                 "observed_rgb": sorted(colors), "timed_stop": True}
        report.append(entry)
        print(json.dumps(entry), flush=True)
    code, stopped = request("/api/v1/rail/stop", {"axis": None})
    assert code == 202, stopped
    print("PASS: HTTP move/status/stop without authentication; RGB outputs and timed stop", flush=True)
finally:
    try:
        request("/api/v1/rail/stop", {"axis": None})
    except Exception:
        pass
    netsh("connect", "name=" + ORIGINAL_PROFILE, "interface=" + INTERFACE)
    if added:
        netsh("delete", "profile", "name=" + PROFILE, "interface=" + INTERFACE)
    print("Original Wi-Fi reconnection requested", flush=True)
    Path(".pio/led-http-demo.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
