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

Song pages and setlists support fonts, chord/lyric views, zoom, tempo blinking, and autoscroll. When a chart has a tempo (a `tempo: NNN` line or `tempo` in `metadata.json`), autoscroll follows the music: each chord line holds the reading line for as long as its bars last, using standalone and inline time signatures (4/4 by default, beats per bar as chord-mark counts them, so 6/8 is two beats). The current chord line is highlighted, and the control becomes a tempo adjuster in BPM, remembered per song, with ↺ returning to the written tempo; the blinker follows it. Charts without a tempo scroll at a constant rate set by the Speed control. Scrolling by hand while playing moves the playhead. Space toggles scrolling, arrows adjust speed or tempo, +/- change size, and Home returns to the top. On song pages, comma/period transpose and 0 resets. Shortcuts leave focused form controls alone.

Transposition and display preferences are saved locally when browser storage is available. In setlists, **Save offline** downloads one HTML file containing the charts and scripts, including the selected transpositions. Open that file to use it without a connection. Offline copies use installed fallback fonts; web fonts require a connection on the normal site. Download again after editing a chart to refresh the copy. **PDF** opens the browser's print dialog.

The VS Code extension supports live edits, transposition, `default`/`dark`/`print` themes, and exporting the active chart through the browser print dialog. Open preview with Ctrl+Shift+V (Cmd+Shift+V on macOS); export with Ctrl+Alt+P (Cmd+Alt+P). Export waits until the requested chart has rendered.

## Validation

Regression tests cover preview document switching, ready/render/export ordering, stale messages, themes, unique export files, safe JSON embedding, setlist references and duplicate IDs, chart rendering, keyboard behavior, blocked storage, independent transposition, offline copies, and syntax highlighting. CI runs the same checks without deploying.
