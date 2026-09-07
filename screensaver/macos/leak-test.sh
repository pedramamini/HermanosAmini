#!/bin/bash
# Does releasing the view actually END the WebKit processes it started?
#
# lifecycle-test.sh answers a DIFFERENT question and passes without answering
# this one: it holds the view alive for the whole run and asserts that CPU
# falls to idle after stopAnimation. That is necessary and it is not
# sufficient. On 2026-09-07 it reported, truthfully, "0.00 cores across 3
# surviving process(es)" while Pedram's Activity Monitor showed ~75 live
# "legacyScreenSaver (Wallpaper) Web Content" processes. Three per engagement,
# idle, never collected, in a host macOS keeps resident. Idle processes are not
# free: each one holds a WebGL context, a page, and its share of GPU memory.
#
# So this asserts the thing that was missing: after the view goes away, the
# processes go away. It tests BOTH exits, because only one of them is polite:
#
#   DISCARD  the view is dropped with no stopAnimation call. This is what a
#            host does when it recycles a view, reconfigures displays, or tears
#            down a preview. Nothing in the saver's own code runs on this path
#            except what AppKit guarantees, which is viewDidMoveToWindow.
#   STOP     stopAnimation, then release. The documented path.
#
# Usage: ./leak-test.sh [path-to-.saver] [boot-secs] [settle-secs]
set -euo pipefail
cd "$(dirname "$0")"

SAVER="${1:-build/HermanosAmini.com.saver}"
BOOT="${2:-12}"
SETTLE="${3:-10}"
[ -d "$SAVER" ] || { echo "no such saver: $SAVER"; exit 1; }
SAVER="$(cd "$SAVER" && pwd)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/main.swift" << 'SWIFT'
import Cocoa
import ScreenSaver

let path = CommandLine.arguments[1]
let bootSecs = Double(CommandLine.arguments[2])!
let settleSecs = Double(CommandLine.arguments[3])!
let mode = CommandLine.arguments[4]        // "discard" | "stop"

func sh(_ cmd: String) -> String {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/sh")
    p.arguments = ["-c", cmd]
    let pipe = Pipe(); p.standardOutput = pipe
    try? p.run(); p.waitUntilExit()
    return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
}
/* Set difference against a baseline, not parent pid: WebKit's children are XPC
   services launched by launchd, so pgrep -P on the host finds nothing. */
func webKitPIDs() -> Set<String> {
    Set(sh("pgrep -f 'com.apple.WebKit' || true").split(separator: "\n").map(String.init))
}
func rssMB(_ pids: Set<String>) -> Double {
    guard !pids.isEmpty else { return 0 }
    let out = sh("ps -p \(pids.joined(separator: ",")) -o rss= 2>/dev/null || true")
    return out.split(separator: "\n").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
              .reduce(0, +) / 1024.0
}
func statusLine(_ view: NSView) -> String {
    if let t = view as? NSTextField { return t.stringValue }
    for s in view.subviews { let r = statusLine(s); if !r.isEmpty { return r } }
    return ""
}
func fail(_ m: String) -> Never { print("FAIL: \(m)"); exit(1) }

guard let b = Bundle(path: path), b.load(),
      let cls = b.principalClass as? ScreenSaverView.Type else { fail("could not load \(path)") }

let rect = NSRect(x: 0, y: 0, width: 360, height: 240)
let app = NSApplication.shared
app.setActivationPolicy(.accessory)

var failures = 0

/* One engagement: build a view in a window, let it paint, then end it the way
   `polite` says and prove the processes it started are gone afterwards. */
func cycle(_ name: String, polite: Bool, _ done: @escaping () -> Void) {
    let baseline = webKitPIDs()
    var v: ScreenSaverView? = cls.init(frame: rect, isPreview: false)
    guard v != nil else { fail("init returned nil") }
    let win = NSWindow(contentRect: rect, styleMask: [.titled], backing: .buffered, defer: false)
    win.title = "leak test: \(name)"
    win.contentView = v
    win.orderFrontRegardless()
    v!.startAnimation()

    DispatchQueue.main.asyncAfter(deadline: .now() + bootSecs) {
        let ours = webKitPIDs().subtracting(baseline)
        let mb = rssMB(ours)
        print(String(format: "  started:  %d WebKit proc(s), %.0f MB   %@",
                     ours.count, mb, statusLine(v!)))
        if ours.isEmpty { fail("startAnimation spawned no web view; nothing to test") }
        if !statusLine(v!).contains("painting") {
            print("  WARN: never reached 'painting'; the leak result still stands")
        }

        if polite { v!.stopAnimation() }
        /* Release it exactly the way a host discards a view. contentView must
           be replaced or the window keeps the last strong reference. */
        win.contentView = NSView(frame: rect)
        win.orderOut(nil)
        v = nil

        DispatchQueue.main.asyncAfter(deadline: .now() + settleSecs) {
            let alive = webKitPIDs().intersection(ours)
            let leakMB = rssMB(alive)
            if alive.isEmpty {
                print("  released: 0 survive. CLEAN")
            } else {
                print(String(format: "  released: %d of %d SURVIVE, %.0f MB still held  <-- LEAK",
                             alive.count, ours.count, leakMB))
                failures += 1
            }
            done()
        }
    }
}

cycle(mode, polite: mode == "stop") { exit(failures == 0 ? 0 : 1) }
app.run()
SWIFT

swiftc -O "$TMP/main.swift" -o "$TMP/leaktest" 2>&1 | grep -v '^$' || true
[ -x "$TMP/leaktest" ] || { echo "FAIL: harness did not compile"; exit 1; }
rc=0
echo "saver: $SAVER"
echo ""
echo "DISCARD (view dropped with no stopAnimation, what a recycling host does)"
"$TMP/leaktest" "$SAVER" "$BOOT" "$SETTLE" discard || rc=1
echo ""
echo "STOP (stopAnimation, then release: the documented path)"
"$TMP/leaktest" "$SAVER" "$BOOT" "$SETTLE" stop || rc=1
echo ""
if [ $rc -eq 0 ]; then
  echo "PASS: both exits collect every process they started."
else
  echo "FAIL: a exit path leaks WebKit processes. Each leaked set is one"
  echo "screensaver engagement that is never collected, and legacyScreenSaver"
  echo "is resident, so they accumulate until logout."
fi
exit $rc
