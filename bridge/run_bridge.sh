#!/bin/zsh
# SKLZ bridge launcher: real camera first, ghost fallback.
# Used as the "shell" of a Maestro terminal tab, so it must end in exec zsh
# to leave a usable prompt when the bridge exits.
cd "$(dirname "$0")"
PY=.venv/bin/python
[ -x "$PY" ] || PY=python3
echo "SKLZ webcam bridge - Ctrl-C stops it, the skull goes back to wandering"
"$PY" webcam_bridge.py || {
  echo ""
  echo "camera unavailable (permission?) - running the scripted ghost instead"
  "$PY" webcam_bridge.py --fake
}
exec zsh
