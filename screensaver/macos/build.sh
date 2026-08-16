#!/bin/bash
# Build, sign, and (credentials permitting) notarize SKLZ.saver.
# Output: build/SKLZ.saver and build/SKLZ-macOS.saver.zip
#
# Notarization needs a one-time credential store on this Mac:
#   xcrun notarytool store-credentials sklz-notary \
#     --apple-id <apple-id-email> --team-id 4N4DQ24LED \
#     --password <app-specific-password from appleid.apple.com>
# Without it the script still produces a signed zip and says what's missing.
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

if xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1; then
  echo "notarizing (waits for Apple)..."
  xcrun notarytool submit build/SKLZ-macOS.saver.zip \
    --keychain-profile "$PROFILE" --wait
  xcrun stapler staple "$OUT"
  # re-zip so the distributed archive carries the stapled ticket
  rm build/SKLZ-macOS.saver.zip
  ditto -c -k --keepParent "$OUT" build/SKLZ-macOS.saver.zip
  echo "signed + notarized + stapled: build/SKLZ-macOS.saver.zip"
else
  echo "SIGNED BUT NOT NOTARIZED: no '$PROFILE' keychain profile."
  echo "Downloads will hit Gatekeeper until notarized (see header for setup)."
fi
