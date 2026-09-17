---
permalink: false
eleventyExcludeFromCollections: true
---

# Fixes and enhancements — September 7, 2026

Implemented the nine findings from `code-review-2026-09-07.md` and the associated enhancements.

## Fixed

- Preview transposition reads the current document instead of retaining the first song.
- PDF export selects the requested editor document and waits for its exact render revision. Stale replies and failed renders cannot trigger export.
- Preview startup uses a ready handshake. PDF titles come from the document, and exports use unique temporary directories.
- The `default`, `dark`, and `print` settings now affect the preview. Its scripts use a nonce-based content security policy.
- Site inputs are restricted to public content roots. Removed the existing generated `AGENTS` and `.claude` note pages from `docs/`.
- JSON in song and setlist pages escapes script terminators while preserving the chart text.
- Repeated setlist songs have distinct occurrence anchors and independent navigation/tempo lookup.
- Corrected the missing Don't Start Now reference. Explicit invalid chart slugs and invalid initial transposition values now fail the build.
- Shared keyboard handling respects focused controls and modifier keys.
- Syntax highlighting checks whole chord lines, allowing ordinary lyrics beginning with A–G to fall through correctly.

## Added

- Shared font/view preferences, guarded storage, zoom, tempo, and autoscroll code; parsed charts are reused when display options change.
- Per-song transposition on song pages and per-occurrence transposition in setlists, saved locally when storage is available. Setlist frontmatter accepts `transpose` from -11 to 11.
- **Save offline** creates a self-contained HTML setlist with scripts, charts, and selected transpositions. The offline copy requires no server; web fonts fall back to installed fonts. Download again after chart edits.
- Setlist PDF control, mobile toolbar wrapping, visible keyboard focus, improved lyric colors, print colors, and accessible control names.
- Optional explicit title, artist, and tempo metadata in `chordmark/metadata.json`, with shared filename fallback using the final artist separator. Existing song URLs are preserved.
- A tracked lockfile, one Eleventy dependency at 3.1.5, VS Code types matching the extension's minimum API version, a declared VSIX packager, and CI checks.
- An extension package allowlist that excludes songs, generated website content, internal notes, and package caches.
- `README.md` documents development, metadata, offline use, and shortcuts. Export now uses Ctrl+Alt+P / Cmd+Alt+P so it does not replace the command-palette shortcut.

## Validation

- `npm run check` passed: TypeScript validation, 13 regression tests, extension compilation, and the site build into `_site/check`.
- Tests execute the real chart bundle in a DOM environment, cover the preview script as well as host logic, and verify that offline HTML can render without external scripts or browser storage.
- The dependency tree is consistent (`npm ls --depth=0`).
- Local VSIX packaging passed. Artifact: `ChatGPT/songhits-0.1.0.vsix` (about 97 KB, ten files including package manifests).
- Source changes pass `git diff --check`. Existing/generated HTML contains whitespace-only warnings; it was not broadly reformatted.
- Builds required access beyond the filesystem sandbox for esbuild's resolver; they completed after automatic approval. The local package was built with missing-repository/license prompts explicitly skipped; no license was assigned and nothing was published.
- No connected browser was available for visual desktop/mobile/print inspection or a real VS Code extension-host session. Automated DOM checks cover behavior but do not replace that visual check.

Existing song edits, the concurrently added charts, and the May Landicho setlist were left intact. No commit or deployment was performed.

Implementation reference: the [official VS Code webview guide](https://code.visualstudio.com/api/extension-guides/webview) documents message passing and content security policies used for the preview lifecycle.
