# HermanosAmini

**UNA OBRA PSICODÉLICA DE LOS HERMANOS AMINI**

### [hermanosamini.com](https://hermanosamini.com)

An infinite Día de los Muertos altar adrift in deep space. A living calavera
watches you, chatters, and throws a grito; an endless tunnel of sugar skulls
drifts past; nebula smoke stirs when you move through it. Everything breathes
with the music.

---

## Where this came from

[**Neema Amini**](https://aminiconant.com) sent his brother
[**Pedram Amini**](https://pedramamini.com) a three-hour downtempo mix, *Ritmos De Los Muertos* by [J. Pool](https://www.youtube.com/watch?v=2Yza5xXfezc), built for Día de los Muertos, the day you remember the people you've lost and
keep them alive by saying their names.

Pedram is a security researcher who mostly builds things that break other
things. He put the mix on, and it turned into this instead: skulls, smoke, and
a three-hour groove. Neema is already scheming to wire a Kinect to it so the
skull tracks whoever walks into the room.

Two brothers, one long song. *Los que amamos nunca mueren.*

---

## The point: it's not finished, and that's deliberate

Most generative art is something you look at. This is something you **argue
with**.

1. **Look at it.** Skulls, nebula, sky events, a face that notices you.
2. **Play with it.** 50+ live dials, 8 palettes, voice control, a gallery of
   boards other people built. Break it however you want; nothing you do is
   permanent.
3. **Ask it for something it doesn't have.** Tell it you want a comet that
   sheds marigold petals, or a skull that hums along. That request becomes a
   **public GitHub issue** in this repo.
4. **It comes back changed.** Approved requests get built by AI agents, merged,
   tagged, and deployed to the live site. The thing you asked for shows up in
   the art, and you get told when it does.

That's the loop. You talk to the piece, and over time the piece becomes partly
yours. Every deployment leaves it recognizably itself with one more thing alive
in it.

**The catch, and it's on purpose:** Pedram is the artist. Anyone can ask;
nothing is built until he comments on the issue and approves it. That gate is
enforced by CI, not by good manners. See
[ART_DIRECTION.md](ART_DIRECTION.md) for what will and won't be accepted, short version, the two themes (Día de los Muertos and deep space) don't bend,
and the music stays Latin downtempo.

---

## Run it

```bash
git clone https://github.com/pedramamini/HermanosAmini
cd HermanosAmini
python3 -m http.server 8765     # open http://localhost:8765
```

One self-contained `index.html`. No build step, no dependencies, no framework.
It runs silently without audio, see [Audio](#audio) below.

## Play with it

| Key | | | Key | |
|---|---|---|---|---|
| `?` | all controls | | `C` | settings + presets |
| `G` | grito | | `Z` | zen mode (hide text) |
| `U` | UFO (2+ dogfight) | | `Y` | mean mug |
| `B` | alebrije spirit | | `I` | save a photo |
| `L` | keyword voice | | `D` | fps / quality monitor |
| `Enter` | surprise me | | `Esc` | back out of panels |

Click the art: the eyes follow you, face parts react, skulls flick away.
Click the microphone to pick how you talk to it:

- **Keyword commands** listen for single words. Say "grito", "ufo", or
  "supernova" and the art responds.
- **Agentic chat** opens a conversation in the bottom right. Ask for what you
  want in plain language ("dim the smoke", "make everything more purple") and
  it changes the piece while it answers. Type or talk; it talks back unless you
  mute it. Ask for something that does not exist yet and it files that as a
  request for the artist instead of pretending.

The chat can only turn dials that already exist. It cannot retheme the piece,
and it is told to refuse if you ask.

### Gesture Percussion

Touching the face plays it. The eye rings shake a maraca, the cheek spirals
scrape a guiro, the teeth clatter like bone, the heart nostril thumps a low tom,
the third eye rings a bell. Flicking a background skull knocks like wood.

Every one of those is synthesized in the browser with Web Audio, not sampled.
The piece ships no percussion files and vendors no audio.

Sounds fire on your gestures only, whether you click or use the keyboard. When
the art chatters its own teeth or stares at you on its own schedule it stays
silent, so the audio always means "you did that". Level lives on the
`gesture sfx volume` dial, and muting the music mutes these too.

Under the hood: WebGL nebula, four stacked canvases, beat detection driving a
BPM-locked tempo, and a five-tier quality ladder that sheds detail until the
piece runs on a phone or an old TV browser.

## Audio

The soundtrack is **"Ritmos De Los Muertos" by J. Pool** and the gritos are
sourced clips. **None of it is ours to redistribute**, so no audio lives in
this repo and none should ever be committed. It's credited on the page and
streamed from our own origin. To run locally with sound, supply your own files
at the paths in `index.html`.

## Contributing

Read [ART_DIRECTION.md](ART_DIRECTION.md) first. It's short and it's the whole
deal. Then open an issue describing what you want to see, as a viewer, not as
code. If it fits the piece and Pedram approves it, it gets built.

## Releases

Every deployment is tagged, so any change rolls back to the exact bytes that
were live.

## License

MIT for the code. The artwork, the name, and the audio are not covered by it.
