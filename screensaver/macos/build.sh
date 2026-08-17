#!/bin/bash
# Build, sign, and (credentials permitting) notarize SKLZ.saver.
# Output: build/SKLZ.saver and build/SKLZ-macOS.saver.zip
#
# Notarization takes credentials one of two ways, checked in this order:
#
#   1. Environment variables, the same three Maestro's release pipeline uses
#      (scripts/notarize.js -> @electron/notarize). Nothing is stored on disk:
#        APPLE_ID=<apple-id-email> \
#        APPLE_TEAM_ID=4N4DQ24LED \
#        APPLE_APP_SPECIFIC_PASSWORD=<app-specific password> ./build.sh
#      With 1Password:
#        APPLE_APP_SPECIFIC_PASSWORD="$(op read 'op://<vault>/<item>/password')" ...
#
#   2. A saved keychain profile on this Mac:
#        xcrun notarytool store-credentials sklz-notary \
#          --apple-id <apple-id-email> --team-id 4N4DQ24LED \
#          --password <app-specific password from appleid.apple.com>
#
# The app-specific password is account-level, not per-app, so the one already
# notarizing Maestro under team 4N4DQ24LED works here unchanged.
# Without either, the script still produces a signed zip and says what's missing.
set -euo pipefail
cd "$(dirname "$0")"

IDENTITY="Developer ID Application: Pedram Amini (4N4DQ24LED)"
PROFILE="sklz-notary"
OUT=build/SKLZ.saver

rm -rf build
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"

clang -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 -fobjc-arc -Wall \
  -bundle SKLZView.m \
  -framework ScreenSaver -framework WebKit -framework AppKit -framework Foundation \
  -o "$OUT/Contents/MacOS/SKLZ"
cp Info.plist "$OUT/Contents/Info.plist"

codesign --force --options runtime --timestamp --sign "$IDENTITY" "$OUT"
codesign --verify --strict --verbose=2 "$OUT"

ditto -c -k --keepParent "$OUT" build/SKLZ-macOS.saver.zip

# Resolve credentials: env vars first (nothing stored), keychain profile second.
NOTARY_ARGS=()
if [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  NOTARY_ARGS=(--apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD")
  echo "notarizing with APPLE_ID env credentials..."
elif xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1; then
  NOTARY_ARGS=(--keychain-profile "$PROFILE")
  echo "notarizing with keychain profile '$PROFILE'..."
fi

if [[ ${#NOTARY_ARGS[@]} -gt 0 ]]; then
  echo "submitting (waits for Apple)..."
  xcrun notarytool submit build/SKLZ-macOS.saver.zip "${NOTARY_ARGS[@]}" --wait
  xcrun stapler staple "$OUT"
  # re-zip so the distributed archive carries the stapled ticket
  rm build/SKLZ-macOS.saver.zip
  ditto -c -k --keepParent "$OUT" build/SKLZ-macOS.saver.zip
  echo "signed + notarized + stapled: build/SKLZ-macOS.saver.zip"
else
  echo "SIGNED BUT NOT NOTARIZED: no APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID"
  echo "in the environment and no '$PROFILE' keychain profile."
  echo "Downloads will hit Gatekeeper until notarized (see header for setup)."
fi
