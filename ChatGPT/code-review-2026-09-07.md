---
permalink: false
eleventyExcludeFromCollections: true
---

# SongHits code review — September 7, 2026

Scope: VS Code extension, Eleventy configuration, page templates, syntax grammar, styles, package configuration, and setlist references in the current working tree. Existing user edits were preserved. Application code was not changed. P1 means fix before the next release; P2 means a normal-priority correctness fix.

## Findings

### 1. P1 — Transposing after changing previews renders the first song

Location: `src/previewPanel.ts:38` (also lines 77–82).

Open song A's preview, explicitly open song B's preview, then press transpose. The message callback closes over the constructor's `document`, which is still A. `createOrShow` updates the current URI and title to B, but the callback sends A's text. A focused test of the actual transpiled class confirmed the final render message contains A while the panel title says B, including when the configuration-change event fires.

Fix: resolve the current document through `getActiveDocument()` in the transpose handler. Keep source, title, and document identity together.

### 2. P1 — Export from another editor can export the wrong song

Location: `src/extension.ts:23` and `src/previewPanel.ts:113`.

Leave A's preview open, switch the active editor to B, then invoke B's Export to PDF command. `triggerExport()` succeeds for any existing preview and never checks the active document. The active-editor listener calls `update(B)`, which refuses a different URI, so it does not correct this. A focused command-handler test confirmed the command requests A's existing HTML without sending B's source.

Fix: pass the requested document into export, render that document, and wait for its render acknowledgement before collecting HTML. A preview toolbar export should continue to export the displayed document.

### 3. P1 — The site build includes internal repository notes

Location: `eleventy.config.js:24` and `eleventy.config.js:94`.

The repository root is the site input, with only a few explicit exclusions. A read-only Eleventy `toJSON()` build using the default configuration confirmed these outputs:

| Input | Generated destination |
|---|---|
| `AGENTS.md` | `docs/AGENTS/index.html` |
| `jed.md` | `docs/jed/index.html` |
| `.claude/commands/chordmark-clean.md` | `docs/.claude/commands/chordmark-clean/index.html` |

`AGENTS.md` includes the user's email address. This is confirmed generation into the publish directory; live public exposure was not checked.

Fix: restrict inputs to site content or explicitly exclude internal documentation, agent folders, and `ChatGPT/`. Remove unintended generated pages before publishing. This review uses `permalink: false` so it does not become another site page.

### 4. P2 — JSON embedded in scripts does not escape HTML script terminators

Location: `_includes/song.njk:179`, `_includes/setlist.njk:317`, and `eleventy.config.js:76`.

`dump | safe` and `JSON.stringify()` produce valid JSON, but a literal `</script>` in a chart still terminates the surrounding HTML script element. A harmless synthetic source confirmed the song template produces truncated JavaScript, and the setlist shortcode preserves the same unsafe sequence. Imported or contributed content could inject another script; no such payload was found in the current charts.

Fix: use a shared serializer that replaces literal `<` with the JSON escape `\u003c` before inserting JSON into HTML. Preserve the existing JSON encoding and Nunjucks `safe` behavior; ordinary HTML escaping would break the JavaScript.

### 5. P2 — Repeated songs produce duplicate anchors and incorrect TOC mapping

Location: `_includes/setlist.njk:247`, `_includes/setlist.njk:263`, and `_includes/setlist.njk:486`.

Each song block uses its slug as its DOM ID. `midyear-od` currently contains six occurrences of `break-my-heart--dua-lipa`, producing six identical IDs. All six navigation links target the same anchor, and the `tocLinks` map overwrites earlier entries with the final link. Repeating a song should be supported even if this particular setlist is a placeholder.

Fix: generate an occurrence ID from part and song indices, use it for anchors and observer lookup, and retain the slug separately for source and tempo lookup.

### 6. P2 — An existing setlist references a nonexistent chart

Location: `setlist/first-in-two-mod/index.md:10` and `eleventy.config.js:72`.

The setlist requests `dont-start-now--dua-lipa`, while the file is `chordmark/dont-start-now-dua-lipa.chordmark`. The shortcode silently swallows the read failure; the build succeeds and the page displays `(chart not found)`. Inspection of all four generated setlists found this missing source.

Fix: correct the reference or rename the canonical file and update all references, preserving existing URLs if renamed. Fail validation when an explicitly supplied slug cannot be resolved; reserve pending-chart behavior for songs without slugs.

### 7. P2 — Global shortcuts intercept dropdown keyboard navigation

Location: `_includes/song.njk:284` and `_includes/setlist.njk:568`.

The keydown handlers ignore only `INPUT`. When a `SELECT` has focus, ArrowUp/ArrowDown change autoscroll speed and call `preventDefault()` instead of allowing normal selection. Space is also intercepted. Focused execution of both handlers confirmed ArrowDown on a select prevents default and changes speed from 1.5 to 1.0.

Fix: exclude selects, textareas, editable content, and other interactive controls as appropriate; respect modifier keys and already-handled events.

### 8. P2 — PDF exports often get a generic or stale title

Location: `src/previewPanel.ts:264` and `src/previewPanel.ts:159`.

`songTitle` starts as `ChordMark` and is updated only when there is no section label. Normal structured charts therefore retain the generic title, or inherit an earlier title. No filename is included in render messages despite the fallback comment. A focused webview-script test confirmed a chart containing a section label exports with title `ChordMark`. The deterministic temporary filename also causes unrelated generic-title exports to share `chordmark-ChordMark.html`.

Fix: send a document-derived title with each render and use a unique temporary file for each export.

### 9. P2 — The advertised preview theme setting has no effect

Location: `package.json:110` and `src/previewPanel.ts:132`.

The extension exposes `default`, `dark`, and `print` themes, but the implementation never reads the theme value, sends it to the webview, or applies a theme class. Changing it triggers a rerender through the general configuration listener without changing styling.

Fix: implement theme selection or remove the inactive setting until supported. The existing print-theme CSS class is never applied.

## Enhancements and follow-up risks

1. **Add a preview-ready handshake.** Initial content is posted immediately after assigning webview HTML, without waiting for its message listener. This is a startup race risk identified by inspection, not reproduced in a live extension host. Send current content on a webview `ready` message, and acknowledge completed renders for export.
2. **Make builds reproducible.** The installed dependency tree is inconsistent: `npm ls` reports `@11ty/eleventy@2.0.1` as invalid against the manifest's `^3.1.5`. The manifest also lists `eleventy` separately, and the lockfile is ignored. Reconcile dependencies, track a lockfile, declare `@vscode/vsce` for the package command, and add CI for type checking, extension compilation, site builds, and reference validation.
3. **Share site control code.** Song and setlist templates duplicate fonts, preferences, zoom, autoscroll, and shortcuts. Extract shared assets; cache parsed songs when changing render options. Add guarded storage access so unavailable storage cannot prevent initial rendering.
4. **Improve performance-time usability.** Add per-song transpose settings in setlists and an offline setlist mode. Check the song toolbar on narrow screens: it lacks the wrapping rules present on the setlist toolbar. Recheck print colors and lyric contrast visually.
5. **Unify metadata handling.** Filename parsing is duplicated and truncates names with additional `--` separators: `ebony--ivory--freestyle` becomes title `Ebony`, artist `Ivory`. Introduce explicit metadata with a shared legacy fallback and validation. Align syntax highlighting with the parser so lyric lines beginning with A–G are not automatically treated as chord lines.

## Validation and limits

- Passed: `npm run site:build -- --output=_site/review-20260907` using the existing installed Eleventy 2.0.1. This preserves tracked `docs/` changes. Overriding the output also brings existing `docs/` pages into the input, so that run's 178-page count is not the normal site count.
- Passed: a separate default-configuration `toJSON()` build, with 84 pages and no writes, confirming the internal-document outputs independently of the temporary output override.
- Passed: `node node_modules/typescript/bin/tsc --noEmit`.
- Confirmed with focused mocks executing actual source: stale transpose source, wrong-document export request, generic export title, and dropdown shortcut interception. These are not full VS Code integration tests.
- Checked all four generated setlists for missing sources and duplicate IDs. Confirmed one missing source and five duplicate occurrences of the same ID in `midyear-od`.
- Confirmed unsafe script serialization using a harmless synthetic chart, without editing song sources.
- `npm run build` could not complete because esbuild encountered a filesystem access denial while resolving the entry point. This is an environment limitation, not a confirmed source-code compilation defect.
- No browser was connected. Responsive layout, scrolling behavior, actual print output, and extension startup were not visually verified. Direct Node chart-rendering checks also require a DOM environment for the bundled sanitizer and did not provide chart validation results.
- Existing source and generated-page changes were preserved. No deployment or dependency installation was performed.
