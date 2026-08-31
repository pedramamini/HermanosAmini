#!/bin/bash
# Regression test for the 2026-08-22 CPU leak: does the saver stop WORKING when
# it stops being on screen?
#
#   ./lifecycle-test.sh
#
# The bug it guards was not a crash and not a visual defect, which is exactly
# why it survived: the screensaver looked perfect and then kept rendering for
# three days after leaving the screen, burning 28.3 CPU-hours across four
# processes with the WebKit GPU process grown to 1.6 GB. Nothing on screen ever
# said so.
#
# Three assertions, in the order the bug happened:
#
#   1. initWithFrame: spawns no WebKit at all. That is where the load call
#      used to live.
#   2. startAnimation does spawn it and the page reaches "painting", because a
#      saver that never starts would pass every CPU check trivially.
#   3. After stopAnimation the CPU those processes consume falls to idle.
#
# Assertion 3 measures a RATE, not a process count, and that distinction is the
# whole test. WKWebView's GPU and Networking services are per-process-pool
# singletons: they outlive the web view by design and only exit with the host,
# so "did the processes disappear" is the wrong question and answering it fails
# a saver that is behaving correctly. The defect was never that processes
# existed. It was that they were doing work.
set -euo pipefail
cd "$(dirname "$0")"
SAVER="${SAVER:-build/HermanosAmini.com.saver}"
case "$SAVER" in /*) ;; *) SAVER="$PWD/$SAVER" ;; esac
[ -d "$SAVER" ] || { echo "no bundle at $SAVER (run ./build.sh first)"; exit 1; }

BOOT_SECS="${BOOT_SECS:-10}"    # long enough for the page to boot its GL context
SAMPLE_SECS="${SAMPLE_SECS:-6}" # each CPU-rate window
IDLE_CEILING="${IDLE_CEILING:-0.03}"   # cores; 3% of one core is noise, not work

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/main.swift" << 'SWIFT'
import Cocoa
import ScreenSaver

let path = CommandLine.arguments[1]
let bootSecs = Double(CommandLine.arguments[2])!
let sampleSecs = Double(CommandLine.arguments[3])!
let idleCeiling = Double(CommandLine.arguments[4])!

func sh(_ cmd: String) -> String {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/sh")
    p.arguments = ["-c", cmd]
    let pipe = Pipe(); p.standardOutput = pipe
    try? p.run(); p.waitUntilExit()
    return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
}

/* Attribution by SET DIFFERENCE against a baseline, not by parent pid.
   WKWebView's WebContent/Networking/GPU processes are XPC services, so launchd
   spawns them and `pgrep -P` on the host finds nothing: an earlier draft
   asserted on the parent link and reported zero children for a saver that was
   demonstrably running one. The machine also has Safari up, so an absolute
   count is meaningless too. What is ours is what appeared after we started. */
func webKitPIDs() -> Set<String> {
    Set(sh("pgrep -f 'com.apple.WebKit' || true").split(separator: "\n").map(String.init))
}

/* Cumulative CPU seconds across a pid set. `ps -o cputime` prints
   [[dd-]hh:]mm:ss.ss, so parse right-to-left rather than assuming a shape. */
func cpuSeconds(_ pids: Set<String>) -> Double {
    guard !pids.isEmpty else { return 0 }
    let out = sh("ps -p \(pids.joined(separator: ",")) -o cputime= 2>/dev/null || true")
    var total = 0.0
    for line in out.split(separator: "\n") {
        let s = line.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "-", with: ":")
        var mult = 1.0
        for part in s.split(separator: ":").reversed() {
            total += (Double(part) ?? 0) * mult
            mult *= (mult == 1.0 ? 60 : (mult == 60 ? 60 : 24))
        }
    }
    return total
}

func statusLine(_ view: NSView) -> String {
    if let t = view as? NSTextField { return t.stringValue }
    for s in view.subviews { let r = statusLine(s); if !r.isEmpty { return r } }
    return ""
}

func fail(_ msg: String) -> Never { print("FAIL: \(msg)"); exit(1) }

let baseline = webKitPIDs()
let app = NSApplication.shared
app.setActivationPolicy(.accessory)          // no Dock icon, no focus steal

guard let b = Bundle(path: path), b.load(),
      let cls = b.principalClass as? ScreenSaverView.Type else {
    fail("could not load \(path)")
}
let rect = NSRect(x: 0, y: 0, width: 360, height: 240)
guard let v = cls.init(frame: rect, isPreview: false) else { fail("init returned nil") }

// 1. the constructor must be inert
let atInit = webKitPIDs().subtracting(baseline)
print("after init:           \(atInit.count) new WebKit process(es)")
if !atInit.isEmpty { fail("initWithFrame: spawned WebKit before startAnimation was ever called") }

let win = NSWindow(contentRect: rect, styleMask: [.titled], backing: .buffered, defer: false)
win.title = "hermanosamini.com lifecycle test"
win.contentView = v
win.setFrameOrigin(NSPoint(x: 40, y: 40))
win.orderFrontRegardless()
v.startAnimation()

DispatchQueue.main.asyncAfter(deadline: .now() + bootSecs) {
    // 2. it must actually be running, or every CPU check below passes trivially
    let ours = webKitPIDs().subtracting(baseline)
    print("after start:          \(ours.count) new WebKit process(es)   \(statusLine(v))")
    if ours.isEmpty { fail("startAnimation spawned no web view; the saver is dead, not fixed") }
    if !statusLine(v).contains("painting") { fail("the page never painted, so there is no work to stop") }

    let runA = cpuSeconds(ours)
    DispatchQueue.main.asyncAfter(deadline: .now() + sampleSecs) {
        let runRate = (cpuSeconds(ours) - runA) / sampleSecs
        print(String(format: "running:              %.2f cores across those processes", runRate))

        v.stopAnimation()
        print("stopAnimation called: \(statusLine(v))")

        // let WebKit settle before measuring; teardown itself costs a little CPU
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            let alive = webKitPIDs().intersection(ours)
            let idleA = cpuSeconds(alive)
            DispatchQueue.main.asyncAfter(deadline: .now() + sampleSecs) {
                let idleRate = (cpuSeconds(alive) - idleA) / sampleSecs
                print(String(format: "stopped:              %.2f cores across %d surviving process(es)",
                             idleRate, alive.count))
                if idleRate > idleCeiling {
                    fail(String(format: "still burning %.2f cores after stopAnimation (ceiling %.2f). "
                                + "That is %.1f CPU-hours a day.", idleRate, idleCeiling, idleRate * 24))
                }
                print(String(format: "PASS: %.2f -> %.2f cores. %.0f%% of the work stopped with the saver.",
                             runRate, idleRate, runRate > 0 ? (1 - idleRate / runRate) * 100 : 100))
                exit(0)
            }
        }
    }
}
app.run()
SWIFT
swiftc -O "$TMP/main.swift" -o "$TMP/lifecycle" 2>&1 | grep -v '^$' || true
"$TMP/lifecycle" "$SAVER" "$BOOT_SECS" "$SAMPLE_SECS" "$IDLE_CEILING"
