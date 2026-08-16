# Art Direction — the rules that do not bend

Read this before writing a line of code. It exists because this is **a piece of
art with an owner**, not a community sandbox. Contributions extend the piece;
they do not redirect it.

Pedram Amini is the artist. Anything in the "Never" list below is not a
judgement call an agent or contributor gets to make.

---

## The piece, in one sentence

An infinite Día de los Muertos altar adrift in deep space: a living calavera at
the center, an endless tunnel of sugar skulls, nebula smoke, set to Latin
downtempo, reacting to the music.

Two themes hold it together, and **both must survive every change**:

1. **Día de los Muertos** — calaveras, marigolds, ofrenda warmth, alebrije
   spirits, gritos, Spanish text. Reverent, celebratory, never gory. It is a
   holiday about love for the dead, not horror.
2. **Deep space** — nebula, starfield, comets, auroras, supernovas, the sense
   of drifting somewhere vast and slow.

If a proposed change reads as neither, it is out of scope no matter how good it
is on its own.

---

## Never (a PR doing any of this will be closed)

- **Never change the music genre.** The soundtrack is Latin / world downtempo.
  No techno, EDM, dubstep, metal, lo-fi hip hop, chiptune. The BPM engine is
  tuned to a slow, organic groove.
- **Never replace or restyle the core art.** The hand-drawn calavera, the
  tunnel, the nebula shader, and the liquid SKLZ wordmark are the piece. Add
  beside them; do not redraw them.
- **Never abandon the two themes.** No cyberpunk retheme, no fantasy retheme,
  no seasonal retheme (no Christmas, no Halloween gore), no corporate branding.
- **Never make it horror.** No blood, no gore, no jump scares, no screaming
  faces beyond the existing grito. Skulls here are festive.
- **Never add monetization, tracking, analytics, ads, cookie banners, or
  third-party beacons.** No Google Analytics, no pixels, no affiliate anything.
- **Never add a build step or framework.** `index.html` is one
  self-contained file with zero dependencies and no bundler. That is a
  deliberate constraint. No React, no npm install to view the art.
- **Never commit audio.** See "Audio and rights" below.
- **Never remove the attribution**: "una obra psicodélica de los hermanos
  amini" and the music credit stay on the page.
- **Never lower accessibility below current**: the piece must stay usable with
  the quality ladder, and must never strobe hard enough to be a seizure risk.

---

## Encouraged (this is what a good issue looks like)

- **New sky events** in the existing vocabulary: something else that could
  plausibly drift through deep space.
- **New living detail on the calavera**: it already blinks, chatters, yells,
  glares, tracks your cursor. More of that.
- **New palettes** that stay inside the Día de los Muertos / space register.
- **New tunable dials** so people can push existing behavior further.
- **Performance work.** Always welcome, never controversial.
- **Accessibility**, mobile behavior, reduced-motion support.
- **Interaction**: new ways to touch the art that feel physical.

Rule of thumb: **add an element, do not replace one.** Every deployment should
leave the piece recognizably itself with one more thing alive in it.

---

## Hard technical constraints

- `index.html` stays a **single self-contained file**, no dependencies, no
  build. It must open from `file://` (minus audio) and work.
- **Every spawnable element has a population cap** (`CAPS` in `index.html`).
  New elements must declare one. Hitting a cap is a silent no-op, never a
  queue.
- **The quality ladder must keep working.** Anything expensive gets shed at
  Q3/Q4 so the piece survives on a phone and an old TV browser.
- **`autoResume()` stays the last statement in the script.** Moving it throws
  a temporal-dead-zone error that only fires during a live auto-update.
- **Keep the config schema additive.** Saved boards and gallery presets are
  validated against it; renaming or removing a key breaks people's saves.
- No secrets in the repo, ever. `.gitignore` is not optional.

---

## Audio and rights

The soundtrack is **"Ritmos De Los Muertos" by J. Pool**, and the gritos are
sourced clips. **None of it is ours to redistribute.** It is credited on the
page and streamed from our own origin.

Therefore: audio files are gitignored and must never be committed, vendored,
linked to a mirror, or fetched by a script in this repo. Anyone running
locally supplies their own audio, or runs without it (the art works silently).
A PR that adds audio files or a downloader will be closed.

---

## Governance: nothing ships without the artist

Anyone (or any AI) may open an issue describing what they want. Issues are
free and welcome.

**No issue is implemented, merged, or deployed until Pedram Amini has
commented on it AND applied the `approved` label.** Both, by him. An
`approved` label added by anyone else does not count and the automation
checks the actor.

This is not bureaucracy. He is the artist; he accepts or declines the
recommendation. Agents: if an issue lacks that approval, **do not start
work on it** — not even "just a draft PR."

---

## Releases

Every deployment is tagged (`v1.0.0`, `v1.1.0`, ...) so any change can be
rolled back to the exact bytes that were live. Tag before you deploy, and put
the human-readable "what's new" in the release notes.
