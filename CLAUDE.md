# CLAUDE.md: for anyone (or any agent) hacking on SKLZ

This is the contributor guide for AI-assisted work on this repo. The piece is
live at **https://hermanosamini.com**; the deployed site self-updates, so what
you see there is `main`.

Read [ART_DIRECTION.md](ART_DIRECTION.md) before writing a line of code. It is
short and it is the whole deal: two themes that do not bend, a "Never" list,
and the governance rule below.

## Governance: the artists decide, not you

Anyone may open an issue. **Nothing is implemented or merged until one of the
Hermanos Amini (pedramamini or neemaamini) applies the `approved` label.** The
label alone is the decision. CI strips it from anyone else. Do not start work
on an unapproved issue, not even a draft PR. When in doubt about scope, ask in
the issue rather than interpreting generously.

## The shape of the code

One `index.html`, ~5,700 lines, zero dependencies, no build step. Deliberate
constraint, not a dare. **A reader's map lives in the header comment at the top
of the `<script>` block**: the four-canvas layer stack, every ALL-CAPS section
in file order, and the invariants. Start there, then grep the section titles.

Support code: `worker/` is the Cloudflare Worker behind the preset gallery,
requests box, and agentic chat, plus `seed_presets.js`, which generates the
curated gallery presets from the live `CFG_SCHEMA` (never hand-write those:
that is how they all lost their colors once). `bridge/` is the local sensor
bridges (webcam, Kinect) that drive the skull's gaze over
`ws://localhost:8181`. `screensaver/` builds the native macOS `.saver` and
Windows `.scr`, both thin webviews pointed at `?kiosk=1`.

## Invariants (each one was learned the hard way)

1. **`CFG_SCHEMA` is the single source of truth for every tunable.** The
   Worker's `LIMITS` whitelist must stay in lockstep, in the same commit.
   `LIMITS` silently drops unknown keys; drift once cost every gallery preset
   its colors and nobody noticed for weeks.
2. **Every spawnable element declares a population cap in `CAPS`.** No
   exceptions. Six trigger sources (keys, voice, chat, random engine, sensor
   bridge, gallery) can all fire at once; a cap hit is a silent no-op, never a
   queue.
3. **`autoResume()` stays the last statement in the script.** Moving it is a
   temporal-dead-zone error that only fires on a live display's first
   auto-update, which is the worst possible place to discover it.
4. **Never commit audio.** The mix and the gritos are not ours to
   redistribute. Sound effects are synthesized with Web Audio at runtime, and
   any new sound must be too. A PR adding audio files or a downloader will be
   closed. The rule is about the REPO: a viewer's own screen recording carries
   the soundtrack (that is what `masterBus` is for), which is a capture of a
   page already playing, not redistribution.
5. **The agentic chat's enforcement boundary is client-side.** The model only
   proposes `{say, actions[]}`; `applyActions()` validates every action
   against `CFG_SCHEMA` and the effect table. Do not move validation into the
   Worker and trust it there, and never render unparsed model output.
6. **The quality ladder must keep working.** Anything expensive sheds at Q3/Q4
   so the piece survives a phone or an old TV. If you add something costly,
   decide what it does under the governor before you ship it.
7. **Every audible thing routes through `masterBus`, never
   `actx.destination`.** That single node is what a screen recording taps, so
   a sound wired straight to the destination plays for the viewer and is
   silently missing from every clip. `<audio>` elements need
   `createMediaElementSource` (once per element, permanently) to join it.
8. **Anything that changes the art on a timer needs an on-screen tell and must
   not persist.** Demo mode is a plain variable, not a `CFG` key: a page that
   started reskinning itself on load, because of a stale setting or someone
   else's gallery preset, is indistinguishable from a bug.

## Working practices that pay off here

- **Verify the artifact, never the command.** A green exit code proves
  nothing. Open the page, read the pixels, dispatch the key event.
- **Screenshot anything visual.** Multiple bugs here were invisible to state
  inspection and obvious in a render. Note: DOM-based captures show the WebGL
  nebula as black (no `preserveDrawingBuffer`); use a pixel/compositor capture
  or an in-tick `readPixels` when checking the shader.
- **Syntax-check before loading:** extract the script block and run
  `node --check` on it. For the Worker, `node --check worker/src/index.js`.
- **Test the failure path.** The bugs that shipped here all lived in states
  normal testing never enters: autoplay refusal, a truncated model reply, a
  wall display's first auto-update.
- Run locally with `python3 -m http.server` from the repo root; the art works
  silently without the audio files. Note the corollary: **you cannot verify
  anything audio-related locally**, and Chrome will not start an AudioContext
  without a real user gesture, which no automation tool here can synthesize.
  When that blocks you, factor the claim until the unverifiable part is small
  and test exactly that part.

## What is intentionally not in this repo

Deploy scripts, hosting configuration, Worker secrets (`wrangler.toml`
carries a salt; `wrangler.toml.example` shows the shape), and all audio.
`CLAUDE.local.md` and `CLAUDE-*.md` are the maintainers' private operational
notes; nothing in them is needed to contribute.
