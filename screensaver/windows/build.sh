#!/bin/bash
# Cross-compile the Windows screensaver from macOS/Linux with mingw-w64.
#   brew install mingw-w64        (macOS)
# Output: build/HermanosAmini.com.scr and build/HermanosAmini.com-Windows.scr.zip
#
# THE .scr FILENAME IS THE NAME Windows shows in the Screen Saver dropdown, so
# it is the product name. The zip keeps the literal token "Windows" because
# index.html's saver modal finds the release asset with /windows/i && /\.zip$/i.
#
# Vendor headers are fetched pinned, not committed:
#   webview 0.12.0 (MIT)  +  Microsoft WebView2 SDK 1.0.2210.55 (headers only;
#   the loader is webview's built-in MIT implementation, so no DLL ships).
set -euo pipefail
cd "$(dirname "$0")"

WEBVIEW_SHA=3ab4b5d722438fc8a13e6ca830c5e2372d19a01d   # tag 0.12.0
WV2_VER=1.0.2210.55

mkdir -p vendor/webview build
if [ ! -f vendor/webview/webview.h ]; then
  curl -fsSL -o vendor/webview/webview.h \
    "https://raw.githubusercontent.com/webview/webview/$WEBVIEW_SHA/core/include/webview/webview.h"
fi
if [ ! -f vendor/WebView2.h ]; then
  curl -fsSL -o /tmp/wv2.nupkg \
    "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$WV2_VER"
  unzip -o -q -j /tmp/wv2.nupkg \
    'build/native/include/WebView2.h' 'build/native/include/WebView2EnvironmentOptions.h' \
    -d vendor
fi

NAME="HermanosAmini.com"                   # the label a human reads
SCR="build/$NAME.scr"
ZIP="$NAME-Windows.scr.zip"                # keep the Windows token, see header

x86_64-w64-mingw32-g++ -std=c++17 -O2 -static -mwindows -Wall \
  -Ivendor sklz.cc \
  -lole32 -lshlwapi -lversion -ladvapi32 -lshell32 -luser32 -lgdi32 \
  -o "$SCR"

x86_64-w64-mingw32-strip "$SCR"
rm -f "build/$ZIP"
(cd build && zip -q "$ZIP" "$NAME.scr")
ls -la build/
echo "unsigned: Windows will show SmartScreen on first run (More info > Run anyway)."
