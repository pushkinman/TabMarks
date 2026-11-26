#!/usr/bin/env python3
"""Generate TabMarks toolbar icons (pure Python, no dependencies).

Usage: python3 scripts/make-icons.py   (writes icons/icon{16,32,48,128}.png)
"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")

TOP = (0x5B, 0x5B, 0xD6)     # indigo
BOTTOM = (0x8E, 0x4E, 0xC6)  # purple
WHITE = (255, 255, 255)
AMBER = (0xF5, 0xB0, 0x0B)


def in_round_rect(x, y, r):
    # unit square [0,1] with corner radius r
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def sample(x, y):
    """Return (r,g,b,a) for a point in unit space."""
    if not in_round_rect(x, y, 0.22):
        return (0, 0, 0, 0)
    t = (x + y) / 2
    col = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    # halo ring
    d = math.hypot(x - 0.46, y - 0.54)
    if 0.17 <= d <= 0.28:
        col = WHITE
    # badge dot with white border
    bd = math.hypot(x - 0.74, y - 0.27)
    if bd <= 0.15:
        col = WHITE
    if bd <= 0.11:
        col = AMBER
    return col + (255,)


def render(size, ss=4):
    rows = []
    for py in range(size):
        row = bytearray([0])  # filter type none
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) / size
                    y = (py + (sy + 0.5) / ss) / size
                    r, g, b, a = sample(x, y)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            n = ss * ss
            a = acc[3] / n
            if acc[3]:
                row += bytes([int(acc[0] / acc[3]), int(acc[1] / acc[3]), int(acc[2] / acc[3]), int(a)])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in (16, 32, 48, 128):
        with open(os.path.join(OUT, f"icon{s}.png"), "wb") as f:
            f.write(png(s, render(s)))
    print("icons written to", OUT)
