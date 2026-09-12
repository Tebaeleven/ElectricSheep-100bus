#!/usr/bin/env python3
"""
Obake 用の極小 LAN DNS（UDP/53）。
obake.media.stackchan の A レコードだけ自前回答し、それ以外は upstream へ転送する。

管理者権限が必要（port 53）。ESP のシステム DNS をこの PC に向ける場合に使う。
通常の検証はファームの kMediaWsLanIp（内蔵マップ）で足りる。
"""
from __future__ import annotations

import argparse
import socket
import struct
import sys


HOSTNAME = "obake.media.stackchan"


def detect_lan_ipv4() -> str:
    """外向き UDP で使うインタフェースの IPv4 を推定する（実通信しない）。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()


def encode_name(name: str) -> bytes:
    out = bytearray()
    for label in name.split("."):
        b = label.encode("ascii")
        out.append(len(b))
        out.extend(b)
    out.append(0)
    return bytes(out)


def parse_question_name(data: bytes, offset: int) -> tuple[str, int]:
    labels: list[str] = []
    jumped = False
    start = offset
    while True:
        if offset >= len(data):
            raise ValueError("truncated name")
        length = data[offset]
        if length == 0:
            offset += 1
            break
        if (length & 0xC0) == 0xC0:
            if offset + 1 >= len(data):
                raise ValueError("bad pointer")
            ptr = ((length & 0x3F) << 8) | data[offset + 1]
            if not jumped:
                start = offset + 2
            offset = ptr
            jumped = True
            continue
        offset += 1
        labels.append(data[offset : offset + length].decode("ascii", errors="ignore"))
        offset += length
    return ".".join(labels), (start if jumped else offset)


def build_a_response(req: bytes, ip: str) -> bytes | None:
    if len(req) < 12:
        return None
    tid = req[:2]
    flags = struct.pack("!H", 0x8180)  # standard query response, no error
    counts = struct.pack("!HHHH", 1, 1, 0, 0)
    # question をそのままエコー
    try:
        qname, qend = parse_question_name(req, 12)
    except ValueError:
        return None
    if qend + 4 > len(req):
        return None
    question = req[12:qend + 4]
    qtype, qclass = struct.unpack("!HH", req[qend : qend + 4])
    if qtype not in (1, 255) or qclass != 1:  # A or ANY
        return None
    if qname.lower().rstrip(".") != HOSTNAME:
        return None
    # answer: pointer to name at 12, type A, class IN, TTL 30, RDATA ipv4
    rdata = socket.inet_aton(ip)
    answer = struct.pack("!HHHLH", 0xC00C, 1, 1, 30, 4) + rdata
    return tid + flags + counts + question + answer


def forward(req: bytes, upstream: str, timeout: float = 2.0) -> bytes | None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        sock.sendto(req, (upstream, 53))
        data, _ = sock.recvfrom(4096)
        return data
    except OSError:
        return None
    finally:
        sock.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="Obake LAN DNS for obake.media.stackchan")
    ap.add_argument("--ip", default="", help="A レコード IP（省略時は自動検出）")
    ap.add_argument("--bind", default="0.0.0.0", help="待ち受けアドレス")
    ap.add_argument("--upstream", default="8.8.8.8", help="転送先 DNS")
    args = ap.parse_args()
    ip = args.ip.strip() or detect_lan_ipv4()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.bind((args.bind, 53))
    except OSError as e:
        print(f"[dns] bind :53 failed ({e}). 管理者で実行するか、ファームの kMediaWsLanIp を使う。", file=sys.stderr)
        return 1
    print(f"[dns] {HOSTNAME} -> {ip}  (upstream {args.upstream})")
    print("[dns] listening UDP 0.0.0.0:53")
    while True:
        data, addr = sock.recvfrom(4096)
        resp = build_a_response(data, ip)
        if resp is None:
            resp = forward(data, args.upstream)
        if resp:
            sock.sendto(resp, addr)


if __name__ == "__main__":
    raise SystemExit(main())
