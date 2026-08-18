#!/bin/bash
# Run the built SKLZ.saver in a real window, exactly as the screensaver engine
# does: load the bundle, instantiate its principal class, call startAnimation.
#
#   ./preview.sh                 # full-screen-ish window, Cmd-Q or Esc to quit
#   ./preview.sh --shot out.png  # render N seconds in, write a PNG, exit
#
# Why this exists: System Settings' preview gives you a black rectangle and no
# reason. This prints every status change to the terminal AND can dump what the
# view actually renders, so a failure names itself.
set -euo pipefail
cd "$(dirname "$0")"
SAVER="${SAVER:-build/SKLZ.saver}"
[ -d "$SAVER" ] || { echo "no bundle at $SAVER (run ./build.sh first)"; exit 1; }

SHOT=""; SECS=12
[ "${1:-}" = "--shot" ] && { SHOT="${2:-/tmp/sklz-preview.png}"; SECS="${3:-12}"; }

TMP=$(mktemp -d)
cat > "$TMP/main.swift" << 'SWIFT'
import Cocoa
import ScreenSaver

let args = CommandLine.arguments
let path = args[1]
let shot = args.count > 2 ? args[2] : ""
let secs = args.count > 3 ? Double(args[3])! : 12.0

let app = NSApplication.shared
app.setActivationPolicy(.regular)

guard let b = Bundle(path: path), b.load(),
      let cls = b.principalClass as? ScreenSaverView.Type else {
    print("FAILED to load \(path)"); exit(1)
}
let screen = NSScreen.main!.frame
let rect = shot.isEmpty ? NSRect(x: 0, y: 0, width: screen.width * 0.7, height: screen.height * 0.7)
                        : NSRect(x: 0, y: 0, width: 1440, height: 900)
guard let v = cls.init(frame: rect, isPreview: false) else { print("init failed"); exit(1) }

let win = NSWindow(contentRect: rect, styleMask: [.titled, .closable],
                   backing: .buffered, defer: false)
win.title = "SKLZ.saver preview"
win.contentView = v
win.center()
win.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
v.startAnimation()

// mirror the on-screen status line into the terminal
var last = ""
Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
    func findLabel(_ view: NSView) -> NSTextField? {
        if let t = view as? NSTextField { return t }
        for s in view.subviews { if let t = findLabel(s) { return t } }
        return nil
    }
    let s = findLabel(v)?.stringValue ?? "(no status label)"
    let hidden = findLabel(v)?.isHidden ?? false
    let line = hidden ? "\(s)   [hidden: art is up]" : s
    if line != last { last = line; print(line) }
}

if !shot.isEmpty {
    DispatchQueue.main.asyncAfter(deadline: .now() + secs) {
        guard let rep = v.bitmapImageRepForCachingDisplay(in: v.bounds) else { exit(1) }
        v.cacheDisplay(in: v.bounds, to: rep)
        guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
        try! png.write(to: URL(fileURLWithPath: shot))
        print("wrote \(shot)")
        exit(0)
    }
}
app.run()
SWIFT
swiftc -O "$TMP/main.swift" -o "$TMP/preview" 2>&1 | grep -v '^$' || true
if [ -n "$SHOT" ]; then "$TMP/preview" "$PWD/$SAVER" "$SHOT" "$SECS"; else "$TMP/preview" "$PWD/$SAVER"; fi
rm -rf "$TMP"
