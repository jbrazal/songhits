# SongHits

A ChordMark library, an Eleventy website, and a VS Code preview extension.

## Development

Use Node.js 22 and install the locked dependencies with `npm ci`.

```sh
npm run site:serve     # Watch and serve the site
npm run site:build     # Generate docs/ for GitHub Pages
npm run build          # Compile the VS Code extension
npm run check          # Type check, regression tests, extension build, isolated site build
npm run package        # Create a local VSIX (does not publish)
```

The site uses `/songhits/` as its path prefix. `docs/` is generated output; edit the templates and source charts. Only `index.njk`, `songs/`, `setlist/`, `chordmark/`, and layouts in `_includes/` are public inputs. Keep notes and tools outside those directories.

## Charts and metadata

Canonical charts live in `chordmark/`. Filenames retain their existing URLs. The final `--` separates an artist from the title. Optional entries in `chordmark/metadata.json` override `title`, `artist`, and integer `tempo` (1–400 BPM) without renaming a chart. Entries must refer to existing chart files.

Setlists use YAML frontmatter with `layout: setlist.njk`, `title`, and `parts`. Each part has a `name` and `songs`; each song has `title`, optional `artist`, and optional `slug`. An omitted slug displays a pending chart; an invalid slug fails the build. Optional `transpose: -2` sets an occurrence's initial transposition, from -11 through 11. Repeated songs have independent anchors and transposition controls.

## Performing and offline use

Song pages and setlists support fonts, chord/lyric views, zoom, tempo blinking, and autoscroll. When a chart has a tempo (a `tempo: NNN` line or `tempo` in `metadata.json`), autoscroll follows the music: each chord line holds the reading line for as long as its bars last, using standalone and inline time signatures (4/4 by default, beats per bar as chord-mark counts them, so 6/8 is two beats). Lyrics under a hidden chord line (Lyrics Only view, teleprompter) keep that line's timing, and in sections with no chord lines each lyric line counts as 2 bars, a trailing `x4` multiplies it, and a `> N bars` cue at the top of the section sets its total. The current line is highlighted, and the control becomes a tempo adjuster in BPM, remembered per song, with ↺ returning to the written tempo; the blinker follows it. Charts without a tempo scroll at a constant rate set by the Speed control. Scrolling by hand while playing moves the playhead. Space toggles scrolling, arrows adjust speed or tempo, +/- change size, and Home returns to the top. On song pages, comma/period transpose and 0 resets. Shortcuts leave focused form controls alone. The Prompter button (or `t`) opens teleprompter mode for tablets: every bar is hidden, the page goes fullscreen and stays awake, and each chart's text is sized so its widest line fills the screen; `+`/`-` scale that fit (remembered), a bottom bar carries Play and Exit, and `Escape` or leaving fullscreen returns to the normal view.

Transposition and display preferences are saved locally when browser storage is available. In setlists, **Save offline** downloads one HTML file containing the charts and scripts, including the selected transpositions. Open that file to use it without a connection. Offline copies use installed fallback fonts; web fonts require a connection on the normal site. Download again after editing a chart to refresh the copy. **PDF** opens the browser's print dialog.

The VS Code extension supports live edits, transposition, `default`/`dark`/`print` themes, and exporting the active chart through the browser print dialog. Open preview with Ctrl+Shift+V (Cmd+Shift+V on macOS); export with Ctrl+Alt+P (Cmd+Alt+P). Export waits until the requested chart has rendered.

## Annotations

Charts can carry cues, shouts, and notes without any change to chord-mark: a line whose first character is a sigil is an ordinary lyric line to the parser and is promoted to a styled block on the page after rendering. Annotated charts still open as readable text in Chord Chart Studio, and they never change bar counts.

| Sigil | Kind | Audience | Example |
| --- | --- | --- | --- |
| `>` | Cue | whole band | `> 4 bars of silence` |
| `>role` | Targeted cue | one player | `>drums kick + toms fill, 4 bars` |
| `!` | Shout | everyone | `! Hupaw, Hupaw x4` |
| `//` | Note | chart author | `// verify bridge voicing off the live take` |

Roles are `drums`, `bass`, `keys`, `gtr`, `vox`, `foh`, `dj`, and `hype`, written with no space after the sigil. An unknown role still renders as an untagged cue and logs a console warning. "N bars" and "xN" in cue text become chips. Songs with targeted cues get a cue view switcher in the toolbar (All, plus one button per role used); the chosen role is remembered across songs. Notes are hidden unless the **Notes** toggle is on and never print.

Placement: a cue applying to what follows goes above its chord line with a blank line before it; a section-wide cue goes right after the `#label`; never put an annotation between a chord line and its `_`-marked lyric line. Cues are labels, not structure: silence still needs bars (`NC NC NC NC`, or `NC % % %`). In sections without chord lines, a `> N bars` cue is the timing: it sets the section's total for autoscroll (or stands alone as N bars of hold), and lyric lines can end in `xN` to repeat. Cue text is prose, so transposing does not change chord names written inside it. `npm run lint:charts` checks placement, reserved prefixes, unknown roles, empty annotations, and cues whose bar count disagrees with the chord block below them. See `chordmark/hupaw--dera.chordmark` for a reference chart.

Display modes render the full chart once and filter with CSS, which is what lets annotations survive Chords Only and Chords + First Line.

## Validation

Regression tests cover preview document switching, ready/render/export ordering, stale messages, themes, unique export files, safe JSON embedding, setlist references and duplicate IDs, chart rendering, keyboard behavior, blocked storage, independent transposition, offline copies, and syntax highlighting. CI runs the same checks without deploying.
