#!/usr/bin/env python3
"""
SKLZ Kinect bridge (Windows): skeleton head tracking -> the skull's gaze.

Requires a Kinect v2 (Xbox One) + the Kinect Adapter for Windows, plus the
Kinect for Windows SDK 2.0. Then:

    pip install pykinect2 websockets
    python kinect_bridge.py
    ...open https://hermanosamini.com

The webcam bridge next to this file does the same job with zero hardware;
the Kinect wins on range, low light, and multi-person scenes. If pykinect2
fights your Python version, any skeleton source works (Node kinect2,
TouchDesigner, Processing SimpleOpenNI) as long as it ends in the same
one-object-per-message JSON on ws://localhost:8181:
    {"x": 0..1, "y": 0..1, "z": meters}
"""

import asyncio
import json
import sys

try:
    import websockets
    from pykinect2 import PyKinectV2, PyKinectRuntime
except ImportError:
    sys.exit("pip install pykinect2 websockets  (Windows + Kinect SDK 2.0)")

kinect = PyKinectRuntime.PyKinectRuntime(PyKinectV2.FrameSourceTypes_Body)
CLIENTS = set()


async def handler(ws):
    CLIENTS.add(ws)
    try:
        await ws.wait_closed()
    finally:
        CLIENTS.discard(ws)


async def pump():
    while True:
        if kinect.has_new_body_frame():
            for body in kinect.get_last_body_frame().bodies:
                if not body.is_tracked:
                    continue
                head = body.joints[PyKinectV2.JointType_Head].Position
                # Camera space: x right (m), y up (m), z away (m).
                # Normalize to 0..1 screen-ish coords; flip x for mirror feel.
                msg = json.dumps({
                    "x": max(0, min(1, 0.5 - head.x / 2.0)),
                    "y": max(0, min(1, 0.5 - head.y / 1.5)),
                    "z": head.z,
                })
                for ws in list(CLIENTS):
                    asyncio.ensure_future(ws.send(msg))
                break            # closest tracked body only
        await asyncio.sleep(1 / 30)


async def main():
    async with websockets.serve(handler, "localhost", 8181):
        print("Kinect bridge on ws://localhost:8181; open https://hermanosamini.com")
        await pump()


if __name__ == "__main__":
    asyncio.run(main())
