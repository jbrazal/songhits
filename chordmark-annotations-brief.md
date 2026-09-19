# Implementation Brief — ChordMark Annotations (cues, shouts, notes)

**Repo:** `songhits` → deploys to https://jbrazal.github.io/songhits
**Goal:** Add a cue / comment / note layer to ChordMark lead sheets — e.g. `4 bars of silence`,
`Hupaw, Hupaw x4`, `kick + toms fill 4 bars` — without forking the `chord-mark` parser, and without
breaking the existing chart toolbar.

> **How this brief was written.** The repo source was not readable, so this is written against the
> *deployed* behaviour of the live site. Everything in §0 is a claim to verify, not a fact. Where
> this brief and the actual code disagree, the code wins — report the difference rather than
> reshaping the code to match the brief.

---

## 0. Discovery — do this first, report findings, then implement

Observed on the live site (treat as ground truth about behaviour, not about implementation):

- Static GitHub Pages build.
- **The chart body renders client-side** — a plain HTML fetch of a song page returns the page chrome
  and toolbar but no chords or lyrics. So `parseSong`/`renderSong` run in the browser.
- Existing per-song toolbar: **Transpose** (± with reset) · **Chord Symbols ↔ Roman Numerals** ·
  **Show Everything / Lyrics Only / Chords Only / Chords + First Line** · **PDF** ·
  **Play** (autoscroll, with speed) · **Size** (font size ±) · Back to top.
- Song pages live at `/songs/<slug>/`, setlists at `/setlist/<slug>/`.

Establish before writing code:

```bash
rg -n "parseSong|renderSong" -g '!node_modules'
rg -n "chord-mark" package.json _config.yml *.json 2>/dev/null
rg -n "Chords Only|Lyrics Only|lyricsOnly|chordsOnly" -g '!node_modules'
rg -n "transpose|Roman|harmonyNotation" -g '!node_modules'
rg -n "jspdf|html2canvas|window.print" -g '!node_modules'
fd -e css -e scss | head -20
ls  # what static site generator? (_config.yml → Jekyll, .eleventy.js → 11ty, astro.config.* → Astro)
```

Answer these in the report before touching anything:

1. What generates the site, and where does the ChordMark source for a song live at runtime —
   embedded in the page, or fetched as a separate file?
2. **How are the four display modes implemented?** Specifically: does the site re-call `renderSong`
   with different options per mode, or does it toggle CSS on one rendered output? *This determines
   the whole shape of §4 and is the single most important discovery item.*
3. How does transpose work — re-parse and re-render, or DOM mutation?
4. Is PDF generated from the live DOM (print CSS / html2canvas) or from a separate render path?
5. Is there a test runner? If not, add vitest + jsdom.
6. Pin `chord-mark` to an exact version. Its API is unstable pre-1.0 and the rendered class names
   are the contract this feature depends on.

---

## 1. The design constraint everything rests on

ChordMark has **no comment syntax**. But any line that is not a chord line, section label, time
signature, or key declaration is parsed as a **lyric line**. A line whose first character cannot
begin a chord symbol is therefore *guaranteed* to be classified as a lyric line.

> **Invariant:** Annotations are sigil-prefixed lyric lines. They are invisible to the parser,
> cannot affect bar math or chord detection, and are promoted to styled blocks in a DOM pass after
> `renderSong`.

Do **not**: fork or patch `chord-mark`; pre-strip annotations before `parseSong`; add a
`customRenderer` for this.

A chart containing annotations must still open in vanilla Chord Chart Studio and degrade to plain
readable text. **That is an acceptance test, not a nice-to-have.**

---

## 2. Notation spec

Sigil is the first non-whitespace character on the line.

| Sigil | Kind | Audience | Example |
|---|---|---|---|
| `>` | **Cue** — performance direction | whole band | `> 4 bars of silence` |
| `>role` | **Targeted cue** | one player | `>drums kick + toms fill, 4 bars` |
| `!` | **Shout** — actually vocalized | everyone | `! Hupaw, Hupaw x4` |
| `//` | **Note** — editorial / chart maintenance | chart author only | `// verify bridge voicing off the live take` |

### Roles

Lowercase, no space between sigil and role: `>drums`, `>bass`, `>keys`, `>gtr`, `>vox`, `>foh`, `>dj`, `>hype`.
Bare `>` = everyone.

**Roles are declared once in site config, not per song.** With ~130 songs in the library, a
per-song `roles:` frontmatter list is churn nobody will maintain. Single source of truth:

```js
// src/config/roles.js  (or wherever site-wide constants live)
export const ROLES = ['drums', 'bass', 'keys', 'gtr', 'vox', 'foh', 'dj', 'hype'];
export const ROLE_LABELS = {
  drums: 'Drums', bass: 'Bass', keys: 'Keys', gtr: 'Guitar',
  vox: 'Vocals', foh: 'FOH', dj: 'DJ', hype: 'Hype',
};
```

An unrecognised role renders as an untagged cue (still visible — never silently dropped) and logs a
console warning naming the song slug.

### Auto-extracted chips

No extra syntax — write naturally, the transform extracts and chips these:

- bar count — `/\b(\d+)\s*bars?\b/i` → renders `4 bars`
- repeat count — `/\b[x×](\d+)\b/i` → renders `×4`

### Reserved — an annotation must never start with

`#` (section label) · `:` (forced lyric) · `%` (repeat) · `\` (bar split) · `[` (sub-beat group) · a digit (time signature)

### Bar-consuming cues must still be real bars

A cue is a **label**, not structure. Silence still has to exist as bars, or the chart's bar count
lies and transpose/autoscroll drift against the actual song:

```
> 4 bars of silence
NC NC NC NC
```

`NC % % %` is the compact form — **write a test proving `%` bar-repeat works with `NC`** in the
pinned version before documenting it as supported. If it doesn't, document `NC NC NC NC` only.

### Placement rules (enforced by the linter, §7)

A marker-less lyric line immediately following a chord line is absorbed into that chord line's layout.

1. A cue applying to what follows goes **above** the chord line, with a blank line above it.
2. A section-wide cue goes on the first line after `#label`.
3. **Never** place an annotation between a chord line and its `_`-marked lyric line.

### Reference fixture

```markdown
---
title: Hupaw
artist: D'ERA
key: Em
tempo: 96
feel: Half-time gospel
---

key Em

#i
> 4 bars of silence — count in silently, entry on the downbeat
NC NC NC NC

>drums kick + toms fill, 4 bars
Em Em Cmaj7 Cmaj7

#v
Em.. Bm.. Cmaj7.. Am7..
_Naa ka'y _gugma nga _wala'y _katapusan

#c
>keys pads only, no comping
! Hupaw, Hupaw x4
Em Cmaj7 G D

#b
// Kuya Mark takes this solo live; chart the head only
>foh vox reverb up, drums out

#s
Em Cmaj7 % %
```

---

## 3. The transform (DOM, client-side)

Rendering happens in the browser, so operate on the DOM, not on the HTML string. This is strictly
better than string/regex post-processing:

- `textContent` is already entity-decoded — no `&gt;` / `&#x2F;` Handlebars-escaping trap.
- Building nodes with `createElement` + `textContent` makes XSS structurally impossible; no manual
  escaping to get wrong.

The default renderer emits `<p class="cmLine"><span class="cmLyricLine">…</span></p>`. Stable class
list: `cmSong`, `cmSection`, `cmSection-xxx`, `cmLine`, `cmChordLine`, `cmChordLineOffset`,
`cmBarSeparator`, `cmChordSymbol`, `cmChordDuration`, `cmEmptyLine`, `cmLyricLine`, `cmSectionLabel`,
`cmSectionMultiplier`, `cmSubBeatGroupOpener`, `cmSubBeatGroupCloser`, `cmTimeSignature`.

### New file — `src/js/chordmark/annotations.js`

```js
import { ROLES, ROLE_LABELS } from '../../config/roles.js';

const MATCHERS = [
  { kind: 'note',  re: /^\/\/\s*(.*)$/ },
  { kind: 'shout', re: /^!\s*(.*)$/ },
  { kind: 'cue',   re: /^>([a-z]*)\s+(.*)$/i },
];

function chips(text) {
  const bars = text.match(/\b(\d+)\s*bars?\b/i);
  const reps = text.match(/\b[x×](\d+)\b/i);
  return [bars && `${bars[1]} bars`, reps && `×${reps[1]}`].filter(Boolean);
}

function parseLine(raw) {
  for (const { kind, re } of MATCHERS) {
    const m = raw.match(re);
    if (!m) continue;
    const role = kind === 'cue' ? (m[1] || '').toLowerCase() : '';
    const text = kind === 'cue' ? m[2] : m[1];
    return { kind, role, text };
  }
  return null;
}

/**
 * Promote sigil-prefixed lyric lines into styled annotation blocks.
 * Idempotent: safe to re-run after transpose / mode changes.
 *
 * @param {Element} root  container holding the rendered .cmSong
 * @param {{slug?: string}} opts
 * @returns {number} count of annotations promoted
 */
export function annotate(root, { slug = '(unknown)' } = {}) {
  let n = 0;
  root.querySelectorAll('p.cmLine > span.cmLyricLine').forEach((span) => {
    const anno = parseLine(span.textContent.trim());
    if (!anno) return;

    let { kind, role, text } = anno;
    if (role && !ROLES.includes(role)) {
      console.warn(`[chordmark] ${slug}: unknown role "${role}" — rendering as untagged cue`);
      role = '';
    }

    const p = span.parentElement;
    p.className = `cmLine cmAnno cmAnno--${kind}`;
    p.dataset.role = role;

    const parts = [];
    if (role) {
      const r = document.createElement('span');
      r.className = 'cmAnnoRole';
      r.textContent = ROLE_LABELS[role] ?? role;
      parts.push(r);
    }
    const t = document.createElement('span');
    t.className = 'cmAnnoText';
    t.textContent = text;
    parts.push(t);
    for (const c of chips(text)) {
      const chip = document.createElement('span');
      chip.className = 'cmAnnoChip';
      chip.textContent = c;
      parts.push(chip);
    }
    p.replaceChildren(...parts);
    n += 1;
  });
  return n;
}

/** Roles actually used in this chart — for building the view switcher. */
export function rolesPresent(root) {
  return [...new Set(
    [...root.querySelectorAll('.cmAnno--cue[data-role]')]
      .map((el) => el.dataset.role)
      .filter(Boolean)
  )];
}

/** Remove editorial notes from the DOM entirely (not merely hidden). */
export function stripNotes(root) {
  root.querySelectorAll('.cmAnno--note').forEach((el) => el.remove());
}
```

### Wire-up

`annotate()` must run **after every render**, not once on page load. Transpose and mode changes
re-render and will wipe the promoted markup. Find the single function that owns "render the chart
into the container" and call `annotate()` at the end of it. If no such single choke point exists,
create one — do not sprinkle `annotate()` calls at each call site.

```js
function renderChart(container, source, opts) {
  container.innerHTML = renderSong(parseSong(source), opts);
  annotate(container, { slug });
  stripNotes(container);          // see §8 decision 1
  syncViewSwitcher(container);
}
```

---

## 4. ⚠ Display-mode conflict — the real problem

**Annotations are lyric lines. "Chords Only" drops lyric lines. So Chords Only would delete every
annotation** — including `> 4 bars of silence`, for exactly the reader who most needs it: the band
member holding a chords-only chart. "Chords + First Line" has the same hazard for any annotation
that isn't the first lyric line of its block.

Since `annotate()` runs on the DOM after render, there is nothing left to promote if `renderSong`
already discarded those lines.

**Required fix:** stop letting `renderSong` do the mode filtering. Render once with lyrics on, run
`annotate()`, then apply mode filtering with CSS on the promoted DOM.

```js
// always render in full, regardless of the user's chosen mode
container.innerHTML = renderSong(parsed, { /* full mode */ });
annotate(container, { slug });
container.dataset.mode = mode;  // 'all' | 'lyrics' | 'chords' | 'chords-first'
```

```css
/* Lyrics Only — hide chord lines, keep shouts and cues */
[data-mode='lyrics'] .cmChordLine { display: none; }

/* Chords Only — hide real lyrics, keep annotations (.cmAnno is no longer .cmLyricLine) */
[data-mode='chords'] .cmLyricLine { display: none; }

/* Chords + First Line — hide all but the first lyric line per section */
[data-mode='chords-first'] .cmLyricLine { display: none; }
[data-mode='chords-first'] .cmSection .cmLine:has(.cmLyricLine):first-of-type .cmLyricLine {
  display: inline;
}
```

Verify the `:has()` selector against the target browsers; if it's a problem, mark the
first-lyric-line elements with a class during `annotate()` instead — that's the more robust route
and is probably worth doing regardless.

**Benefits beyond fixing the bug:** one parse+render instead of one per mode switch, so mode
toggling becomes instant, and transpose state survives a mode change for free.

**Risk:** this modifies existing working behaviour. If discovery (§0 Q2) shows the site already does
CSS-based mode filtering, this section is mostly a no-op and only the annotation-specific rules are
new. If it shows per-mode `renderSong` calls, this is a real refactor — **report the scope back
before executing it.**

---

## 5. Styling

No CSS framework assumed. Sizes in `em` throughout so annotations scale with the existing font-size
control.

```css
:root {
  --cm-anno-cue:   #6b7280;
  --cm-anno-shout: #b45309;
  --cm-anno-note:  #9ca3af;
}
@media (prefers-color-scheme: dark) {
  :root {
    --cm-anno-cue:   #9ca3af;
    --cm-anno-shout: #fbbf24;
    --cm-anno-note:  #6b7280;
  }
}

.cmAnno {
  display: flex;
  align-items: baseline;
  gap: 0.5em;
  margin-block: 0.35em;
  padding-inline-start: 0.6em;
  border-inline-start: 0.15em solid currentColor;
  font-size: 0.85em;
  line-height: 1.3;
}
.cmAnno--cue   { color: var(--cm-anno-cue); font-style: italic; }
.cmAnno--shout {
  color: var(--cm-anno-shout);
  font-style: normal;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cmAnno--note  { color: var(--cm-anno-note); font-size: 0.78em; }

.cmAnnoRole {
  flex: none;
  font-variant: all-small-caps;
  font-weight: 600;
  letter-spacing: 0.06em;
  opacity: 0.85;
}
.cmAnnoChip {
  flex: none;
  padding-inline: 0.35em;
  border: 1px solid currentColor;
  border-radius: 0.2em;
  font-size: 0.85em;
  font-variant-numeric: tabular-nums;
}

/* Per-player view: hide cues addressed to someone else.
   Untargeted cues (data-role="") and shouts always show. */
[data-view] .cmAnno--cue[data-role]:not([data-role='']) { display: none; }
[data-view='drums'] .cmAnno--cue[data-role='drums'] { display: flex; }
/* …generate one rule per role from ROLES rather than hand-maintaining this list */

@media print {
  .cmAnno--note { display: none !important; }
  .cmAnno { break-inside: avoid; }
  .cmAnno--cue   { color: #555; }
  .cmAnno--shout { color: #000; }
}
```

### View switcher

Add to the existing toolbar, in the same visual language as the current mode buttons — do not
introduce a second control idiom.

- Buttons: `All` (clears `data-view`) + one per role **actually present in this chart**
  (`rolesPresent()`). A song with no drum cues shows no Drums button.
- Hide the whole control when the chart has zero targeted cues — most of the 130-song library.
- Persist in `localStorage` keyed by **role, not song** — a drummer stays a drummer across the setlist.
- `aria-pressed` on the active button; keyboard reachable.
- Default (no `data-view`) shows everything, so the chart is fully readable with JS view state absent.

### Known limitation — transpose does not reach cue text

`>keys hold the Bb` stays `Bb` in every key. Cue text is prose and is not parsed as chords.
**Document this in the README.** If it becomes a real annoyance, the fix is an inline `{Bb}` token in
cue text that `annotate()` transposes using the chart's current transpose offset — design it then,
don't build it now.

### PDF

If PDF is produced from the live DOM (print CSS or html2canvas), annotations come along for free —
just confirm the print rules above apply and that notes are absent. If it's a separate render path,
that path needs its own `annotate()` call. Determine which in §0 Q4.

---

## 6. Tests

`src/js/chordmark/__tests__/annotations.test.js` (vitest + jsdom):

1. **Degradation guarantee (most important).** Parse the §2 fixture with vanilla `parseSong`.
   Assert no errors, and that per-section bar counts are **identical** to the same chart with every
   annotation line deleted. *Annotations must not change the music.*
2. Each sigil produces the right `cmAnno--{kind}` class.
3. `>drums …` → `data-role="drums"`; bare `> …` → `data-role=""`.
4. Unknown role → `data-role=""`, console warning, **still rendered** (never dropped).
5. Chips: `4 bars` → one chip; `x4` and `×4` → `×4`; both → two chips.
6. XSS: an annotation containing `<script>alert(1)</script>` appears as literal text, no element.
7. A normal lyric line is untouched (same node, same text).
8. A lyric line with `>` mid-line is **not** matched — sigil is first-character-only.
9. `annotate()` is idempotent: running twice yields the same DOM and returns 0 the second time.
10. `stripNotes()` removes `cmAnno--note` and nothing else.
11. `rolesPresent()` returns only roles present, deduped.
12. **Mode integration:** in `chords` mode, `.cmAnno` elements are visible while `.cmLyricLine` are
    hidden. This is the regression test for §4 — it must fail against current `main`.
13. `NC % % %` — assert actual bar count against the pinned version. Decides whether the compact
    form gets documented.

---

## 7. Linter

`src/js/chordmark/lint.js` + an `npm run lint:charts` script, run in CI over all song sources.

| Rule | Severity | Check |
|---|---|---|
| `anno-after-chordline` | error | Annotation directly follows a chord line (absorbed into layout) |
| `anno-splits-lyric` | error | Annotation between a chord line and its `_`-marked lyric line |
| `reserved-prefix` | error | Annotation text begins with `#`, `:`, `%`, `\`, `[`, or a digit |
| `unknown-role` | warn | Role not in `ROLES` |
| `bar-count-prose` | warn | Cue says "N bars" but the following chord block has a different bar count |
| `empty-anno` | warn | Sigil with no text after it |

`bar-count-prose` is the highest-value rule — it catches a chart lying about its own structure.
Implement it last if time is short, but implement it.

---

## 8. Decisions to surface back to Jed — do not guess

1. **`//` notes:** strip from all builds, or keep behind a "notes on" toggle for his own use?
   The code above strips unconditionally; change if he wants the toggle.
2. **§4 scope.** If mode filtering turns out to be per-mode `renderSong` calls, the fix is a real
   refactor of working code. Report the scope and wait.
3. **`NC % % %`** valid in the pinned version (test 13)? Docs depend on the answer.
4. **Role vocabulary** — is the list in §2 right for D'ERA and his solo work, or does he want
   `perc`, `horns`, `sax`, `bgv`?
5. Should shouts (`!`) be extractable into a separate chant sheet for backing vocalists? Out of
   scope here; the markup supports it later.

---

## 9. Acceptance criteria

- [ ] Annotated charts parse in vanilla `chord-mark` with unchanged bar counts (test 1).
- [ ] Annotated charts paste into Chord Chart Studio and render as readable plain text.
- [ ] `>`, `>role`, `!`, `//` render with distinct, legible styling on screen and in print.
- [ ] **Annotations survive all four display modes**, including Chords Only (test 12).
- [ ] Annotations survive transpose and Roman-numeral toggling (re-render calls `annotate()`).
- [ ] Annotations scale with the existing font-size control.
- [ ] Per-player view hides other roles' cues; untargeted cues and shouts always visible.
- [ ] View switcher hidden entirely on charts with no targeted cues.
- [ ] Editorial notes absent from the DOM, not merely hidden.
- [ ] Annotations appear in PDF export; notes do not.
- [ ] Linter catches the §7 placement errors; wired into CI.
- [ ] No changes under `node_modules/chord-mark`; version pinned exactly.
- [ ] Existing songs with no annotations render byte-identically to before.

---

## 10. Docs

- `README.md` — "Annotations" section: sigil table, reference fixture, transpose limitation.
- Update the `chordmark` skill (`references/syntax.md`, `references/patterns.md`) with the sigil
  table, placement rules, and the "cues are labels, not structure" rule in the mistakes table.
- Commit the §2 fixture as a real song page so the rendering is visually reviewable.
