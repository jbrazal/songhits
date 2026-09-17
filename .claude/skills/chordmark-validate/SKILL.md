---
name: chordmark-validate
description: Validate .chordmark chart files against the real chord-mark renderer the site uses. Use after writing or editing any .chordmark file, when a chart renders wrong in the preview/site, when asked to "check", "lint", "validate" or "verify" a chord chart, or before committing chart changes. Catches chord lines that silently fell back to lyrics (bad chord symbols, beat-count errors, pipe/hyphen notation), lyric "_" marker/chord count mismatches, bad section labels and blank lines inside sections.
---

# ChordMark validation

Run the project validator — it loads `media/chord-mark.js` (the exact build the site and preview panel use) in jsdom, parses + renders every chart, and reports problems with file:line.

```bash
npm run chordmark:validate                                   # all of chordmark/
node scripts/validate-chordmark.cjs chordmark/foo--bar.chordmark   # one or more files/dirs
node scripts/validate-chordmark.cjs --json                   # machine-readable
```

Exit code 1 = at least one ERROR. Warnings alone exit 0.

## What it reports

| Level | Message | Meaning / fix |
|---|---|---|
| ERROR | `parse/render threw` | The library crashed on the file. Bisect by deleting sections. |
| ERROR | `chord-like line parsed as lyric` | chord-mark did not accept the line as chords, so it will render as lyrics. Causes: pipe notation (`\| G \| D \|`), hyphenated chords (`Em-C`, `F#---`), doubled symbols (`GG`), a bar whose dots don't add up to the time signature (`C.. G.` in 4/4), a `%` with no chord line before it. Rewrite in ChordMark: `G D`, `Em.. C..`, `F# F# F# F#`. |
| ERROR | `bad section label` | Must be `#` + letters only, optional ` xN`. `#Post-Chorus`, `#Verse 1`, `#(Solo)` are invalid — use `#p`, `#v`, `#s`, or `#PostChorus`. |
| warning | `N "_" marker(s) but chord line above has M chord(s)` | Add/remove `_` so every chord is positioned; unmarked chords pile up at the end of the line. |
| warning | `blank line inside a section` | Blank line between a chord line and its lyric. Run `/chordmark-clean` or delete it. |
| warning | `bar "…" has N beats in M/x` | Uneven bar. Fix the dots. |
| warning | `parsed N lines vs M raw lines; line numbers may drift` | The validator could not align parser output to the file; reported line numbers in that file are approximate. Report this — it usually means a new synthetic-line case the script does not know. |

## Workflow

1. After editing a chart, run the validator on that file.
2. Fix every ERROR; it will render wrong otherwise. Fix warnings unless the author clearly intended them.
3. Re-run until clean, then (if asked) `npm run site:build`.
4. Do not "fix" a chart by deleting musical content — rewrite the notation. See the `chordmark` skill for syntax.

## Known limitations

- Lyric-to-beat placement of `_` markers is not checked musically, only counted.
- Chord symbols the ChordSymbol library accepts (e.g. `A#m7-5`, `G7+5`, `C#M7`) pass even if unconventional; that is fine.
- Charts written in a non-ChordMark ASCII style (e.g. `ebony--ivory--freestyle.chordmark` with `|` bars) will error on every chord line; converting them is a separate task — ask before doing it.
