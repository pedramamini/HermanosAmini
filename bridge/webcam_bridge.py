#!/usr/bin/env python3
"""
SKLZ webcam bridge: the skull watches whoever is in the room.

Reads your webcam, finds the largest face, and streams its position to the
art over ws://localhost:8181. The live site (hermanosamini.com) auto-connects
to that port with forever-retry, so the whole setup is:

    pip install opencv-python websockets
    python3 webcam_bridge.py
    ...then open https://hermanosamini.com

Walk left, the eyes follow. Walk toward the screen, it glares at you.

No Kinect required: any webcam works. macOS will ask once for camera
permission for your terminal. Run with --fake to test the plumbing without a
camera at all (a scripted ghost paces the room and leans in).

Protocol (one JSON object per message, matching the page's sensorBridge):
    {"x": 0..1, "y": 0..1, "z": meters-ish}
x/y aim the skull's gaze; z under 1.2 earns you the stare. x is mirrored so
moving left moves the gaze left, like a mirror.
"""

import argparse
import asyncio
import json
import math
import sys

try:
    import websockets
except ImportError:
    sys.exit("pip install websockets")

CLIENTS = set()
HZ = 20                      # send rate; the page just uses the latest


async def handler(ws):
    CLIENTS.add(ws)
    print(f"page connected ({len(CLIENTS)} client{'s' if len(CLIENTS) != 1 else ''})")
    try:
        await ws.wait_closed()
    finally:
        CLIENTS.discard(ws)
        print("page disconnected")


def broadcast(msg):
    dead = []
    for ws in CLIENTS:
        try:
            asyncio.ensure_future(ws.send(msg))
        except Exception:
            dead.append(ws)
    for ws in dead:
        CLIENTS.discard(ws)


async def pump_fake():
    """A scripted ghost: paces the room, then walks up close for the stare."""
    t = 0.0
    print("running --fake: a ghost paces left/right, leaning in every ~8s")
    while True:
        t += 1 / HZ
        x = 0.5 + 0.45 * math.sin(t * 0.7)          # pace the room
        y = 0.45 + 0.05 * math.sin(t * 1.9)
        z = 2.2 if (t % 8) < 6 else 0.8             # periodically lean in
        broadcast(json.dumps({"x": round(x, 3), "y": round(y, 3), "z": z}))
        await asyncio.sleep(1 / HZ)


async def pump_camera(cam_index):
    try:
        import cv2
    except ImportError:
        sys.exit("pip install opencv-python  (or use --fake to test without a camera)")

    cap = cv2.VideoCapture(cam_index)
    if not cap.isOpened():
        sys.exit(f"could not open camera {cam_index}. On macOS, grant your "
                 f"terminal camera access in System Settings > Privacy, or "
                 f"try --camera 1. Use --fake to test without one.")

    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    print("camera open; face tracking. Ctrl-C to stop.")

    last = None
    while True:
        ok, frame = cap.read()
        if not ok:
            await asyncio.sleep(0.5)
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        fh, fw = gray.shape[:2]
        faces = cascade.detectMultiScale(gray, 1.2, 5, minSize=(40, 40))
        if len(faces):
            # the largest face is the person, not the poster behind them
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            cx, cy = x + w / 2, y + h / 2
            # Rough range from face size: a head is ~0.15m wide and a typical
            # webcam FOV ~60deg, so z ~ 0.13 / (face width fraction). It only
            # has to be right about one thing: under 1.2m when you lean in.
            frac = max(w / fw, 1e-3)
            z = round(min(5.0, 0.13 / frac), 2)
            msg = {"x": round(1 - cx / fw, 3),       # mirrored
                   "y": round(cy / fh, 3),
                   "z": z}
            last = msg
            broadcast(json.dumps(msg))
        elif last is not None:
            # lost the face: back away gracefully so the stare releases
            last = None
            broadcast(json.dumps({"x": 0.5, "y": 0.45, "z": 4.0}))
        await asyncio.sleep(1 / HZ)


async def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fake", action="store_true",
                    help="no camera: a scripted ghost tests the whole pipeline")
    ap.add_argument("--camera", type=int, default=0,
                    help="camera index if you have more than one (default 0)")
    ap.add_argument("--port", type=int, default=8181,
                    help="WebSocket port; the page listens on 8181")
    args = ap.parse_args()

    async with websockets.serve(handler, "localhost", args.port):
        print(f"bridge on ws://localhost:{args.port}; open https://hermanosamini.com")
        await (pump_fake() if args.fake else pump_camera(args.camera))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nbye")
