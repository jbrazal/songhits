# Feast setlist drum backing track — 7 November 2026

Kick, closed hi-hat, and snare only. The rendered audio is mono, 44.1 kHz. Each
song starts with one bar of four closed-hat count-in beats. There are two seconds
between songs in the continuous file.

## Play

- [Continuous set — MP3](feast-2026-11-07-kick-hat-snare.mp3)
- The lossless WAV masters are retained locally and can be regenerated with
  `python -B build.py`. They are excluded from Git because the continuous WAV
  exceeds GitHub's normal per-file limit.
- Individual MP3, WAV, and General MIDI drum files are alongside this document.
  MIDI uses channel 10: kick 36, snare 38, closed hi-hat 42. Section markers are
  embedded in each MIDI file.

| Song | BPM | Start in continuous set | Approx. length |
|---|---:|---:|---:|
| Turn It Up | 124 | 0:00 | 3:06 |
| Christ Is My Rock | 148 | 3:08 | 3:28 |
| Goodness Of God | 63 | 6:39 | 6:22 |
| Never Walk Alone | 72 | 13:02 | 6:44 |
| Turn It Up — Closing | 124 | 19:48 | 1:24 |

The exact section starts, bar counts, and drum intensity are in
[`cue-sheet.json`](cue-sheet.json). The tracks follow the five entries in
[`setlist/feast-2026-11-07/index.md`](../../setlist/feast-2026-11-07/index.md).
Use `python -B build.py` from this directory or the repository root to render
them again. Python needs NumPy and FFmpeg on `PATH`.

## Arrangement decisions

- Bar counts are rehearsal estimates based on the ChordMark charts and
  `temp/Feast-Edmonton-Worship-Structure_07NOV2026.xlsx`. A chord without dots
  was counted as one bar; dotted chords use their beat lengths. All songs use
  4/4 in this render.
- Acoustic-only sections have a hat count-in, followed by silence until the
  indicated drum entrance. Light sections use soft eighth-note hats, kick on
  beat 1, and snare on beat 3. Full sections use eighth-note hats, kick on 1
  and 3, snare on 2 and 4, and a light kick pickup. Builds gradually increase
  that same three-piece pattern.
- The spoken opening loop in the closing reprise is fixed at four bars. The
  opening Turn It Up chart starts at its two-pass lead-guitar intro; its
  open-ended spoken loop is not timed.
- Goodness Of God follows the workbook path from bridge x2 to the acoustic
  chorus, then the final all-in chorus. The chart-only instrumental and extra
  bridge x2 are omitted.
- Never Walk Alone uses **72 BPM**, which is absent from the local chart and
  workbook but listed by [Worship Together](https://www.worshiptogether.com/songs/never-walk-alone-hillsong-worship/).
  Its unspecified 2/4 bars and the final leader-controlled slowdown are not
  timed here.

These are playable rehearsal grids, not synchronized reproductions of the
recordings. Confirm the song lengths, stops, and open-ended worship moments
with the worship leader before using the continuous track live. The MIDI files
make those edits practical.
