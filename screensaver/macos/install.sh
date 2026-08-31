#!/bin/bash
# Install the screensaver AND make macOS actually run the new code.
#
#   ./install.sh                       # install build/HermanosAmini.com.saver
#   ./install.sh ~/Downloads/HermanosAmini.com.saver
#
# Why this is not just a copy:
#
# macOS keeps `legacyScreenSaver.appex` resident, and an Objective-C bundle
# cannot be unloaded once it is in a process. A host that started BEFORE you
# installed a new .saver keeps executing the old code for as long as it lives,
# which can be hours. You reinstall, hit Preview, and see the previous build.
# Nothing about that is visible: same path, same name, older inode.
#
# It cost a full day of "black screen" reports where the installed binary was
# byte-identical to the fixed one, because the running host had a 7-hour-old
# copy of it mapped in. So: copy, then kill the hosts.
set -euo pipefail
cd "$(dirname "$0")"

NAME="HermanosAmini.com"                   # matches build.sh; the picker label
SRC="${1:-build/$NAME.saver}"
case "$SRC" in /*) ;; *) SRC="$PWD/$SRC" ;; esac
[ -d "$SRC" ] || { echo "no bundle at $SRC (run ./build.sh first)"; exit 1; }

DEST="$HOME/Library/Screen Savers"
mkdir -p "$DEST"

# RETIRE EVERY OLDER COPY, MATCHED BY BUNDLE IDENTIFIER, NEVER BY FILENAME.
# macOS lists screensavers by FILE, so a rename leaves the previous bundle
# sitting in the picker as a second entry that still previews whatever it was
# last built from. Nothing warns; you just get two.
#
# Matching on the name does not work, and that is measured rather than assumed:
# this machine had "SKLZ - Hermanos Amini.saver", a hand-renamed install that
# no build script ever produced. A filename check for "SKLZ.saver" sailed past
# it and left the duplicate in place. CFBundleIdentifier is the one thing that
# is the same across every copy however it was named, which is exactly why it
# is the field that must NOT be renamed with the product.
BUNDLE_ID=$(plutil -extract CFBundleIdentifier raw "$SRC/Contents/Info.plist")
for old in "$DEST"/*.saver; do
  [ -d "$old" ] || continue
  [ "$(basename "$old")" = "$NAME.saver" ] && continue        # the one we are installing
  oid=$(plutil -extract CFBundleIdentifier raw "$old/Contents/Info.plist" 2>/dev/null || true)
  if [ "$oid" = "$BUNDLE_ID" ]; then
    echo "retiring:  $(basename "$old") (same bundle id, older name)"
    rm -rf "$old"
  fi
done

# Show what is being replaced, so a no-op install is obvious.
if [ -d "$DEST/$NAME.saver" ]; then
  echo "replacing: $(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$DEST/$NAME.saver")"
fi

rm -rf "$DEST/$NAME.saver"
ditto "$SRC" "$DEST/$NAME.saver"
# Strip quarantine: a downloaded bundle otherwise prompts on first run even
# though it is notarized.
xattr -dr com.apple.quarantine "$DEST/$NAME.saver" 2>/dev/null || true
echo "installed:  $DEST/$NAME.saver"

# THE POINT OF THIS SCRIPT. Without it the next Preview reuses the old code.
# `|| true`: pgrep exits 1 when nothing matches, and `set -o pipefail` turns
# that into a fatal error that skips the kill, which is the whole point here.
BEFORE=$( (pgrep -x legacyScreenSaver 2>/dev/null || true) | wc -l | tr -d ' ')
killall legacyScreenSaver 2>/dev/null || true
killall ScreenSaverEngine 2>/dev/null || true
sleep 1
echo "killed $BEFORE stale screensaver host(s); the next preview loads the new build"

# Verify the artifact, not the command: report what is actually on disk.
if [ -x "$DEST/$NAME.saver/Contents/MacOS/SKLZ" ]; then
  # No pipe into grep -m1 here: it SIGPIPEs codesign, pipefail turns that into
  # a failure, and the fallback printed "unsigned" underneath a perfectly valid
  # Developer ID line. A verification step that lies is worse than none.
  SIGINFO=$(codesign -dv --verbose=2 "$DEST/$NAME.saver" 2>&1 || true)
  echo "verify:     $(printf '%s\n' "$SIGINFO" | grep Authority | head -1 || echo 'UNSIGNED')"
  echo "gatekeeper: $(spctl -a -vv -t install "$DEST/$NAME.saver" 2>&1 | head -1 || true)"
fi
echo
echo "The build stamp shows in the saver's own status line. If Preview ever"
echo "shows an older stamp than this install, a stale host survived: rerun this."
