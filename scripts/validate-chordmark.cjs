#!/usr/bin/env node
/**
 * Validate .chordmark files with the same chord-mark build the site uses (media/chord-mark.js).
 *
 * Usage:  node scripts/validate-chordmark.cjs [file-or-dir ...]     (default: chordmark/)
 *         add --json for machine-readable output
 *
 * Checks, per file:
 *   - parses and renders without throwing
 *   - no line the parser classified in an unexpected way (e.g. a chord line that fell back to lyric
 *     because of a typo like "Bm7 |" or "A/C#..")
 *   - bar beat-math: chord-mark reports uneven/invalid bars as lyric lines, so we flag chord-looking
 *     lyric lines explicitly
 *   - lyric lines whose "_" marker count does not match the chord count of the chord line above
 *   - section labels that are not "#" + letters (+ optional " xN")
 *   - blank lines inside a section (chord/lyric separated by an empty line)
 * Exit code 1 if any file has errors; warnings alone exit 0.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const dom = new JSDOM('', { runScripts: 'outside-only' });
dom.window.eval(fs.readFileSync(path.join(ROOT, 'media', 'chord-mark.js'), 'utf8'));
const cm = dom.window['chord-mark'];

const args = process.argv.slice(2);
const json = args.includes('--json');
const targets = args.filter(a => !a.startsWith('--'));
if (!targets.length) targets.push('chordmark');

const files = [];
for (const t of targets) {
  const p = path.resolve(ROOT, t);
  if (fs.statSync(p).isDirectory()) {
    for (const f of fs.readdirSync(p)) if (f.endsWith('.chordmark')) files.push(path.join(p, f));
  } else files.push(p);
}

// A line that "looks like" chords: only chord-ish tokens, dots, brackets, NC, %, \, |
const TOKEN = String.raw`[A-G][#b]?[A-Za-z0-9#b+°ø()\-]*(\/[A-G][#b]?)?\.*|NC\.*|%%?|\\|\[|\]|\|`;
const CHORDISH = new RegExp(String.raw`^\s*(${TOKEN})(\s+(${TOKEN}))*\s*$`);

function checkFile(file) {
  const rel = path.relative(ROOT, file);
  // Normalize CRLF: the parser keeps "\r" on line strings, which breaks raw/parsed alignment.
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const errors = [], warnings = [];
  const raw = src.split('\n');

  let parsed;
  try {
    parsed = cm.parseSong(src);
    cm.renderSong(parsed, { chartType: 'all' });
  } catch (e) {
    errors.push({ line: 0, msg: `parse/render threw: ${e.message}` });
    return { file: rel, errors, warnings };
  }

  // The parser inserts synthetic lines: bodies of empty repeated sections (a bare "#c", whose label
  // is flagged as a copy too) and auto-repeated chord lines under extra lyric lines. Keep the label,
  // drop the rest, so indexes line up with the raw file.
  const lines = [];
  {
    let j = 0;
    for (const l of parsed.allLines) {
      const synthetic = l.isFromSectionCopy || l.isFromAutoRepeatChords; // "%" lines are flagged too, but map 1:1 to a raw line
      if (synthetic && !(l.type === 'sectionLabel' && raw[j] === l.string)) continue;
      lines.push(l); j++;
    }
    if (lines.length !== raw.length)
      warnings.push({ line: 0, msg: `parsed ${lines.length} lines vs ${raw.length} raw lines; line numbers may drift` });
  }
  let prevChord = null;   // last chord line object
  let inSection = false;
  let prevType = null;

  lines.forEach((l, i) => {
    const n = i + 1;
    const text = raw[i] ?? '';
    switch (l.type) {
      case 'sectionLabel':
        if (!/^#[A-Za-z]+(\s+x\d+)?\s*$/.test(text)) errors.push({ line: n, msg: `bad section label "${text}"` });
        inSection = true; prevChord = null;
        break;
      case 'chord':
        prevChord = l;
        break;
      case 'lyric': {
        if (CHORDISH.test(text) && text.trim()) {
          errors.push({ line: n, msg: `chord-like line parsed as lyric (bad chord symbol or beat count): "${text.trim()}"` });
        } else if (prevType === 'chord' && prevChord) {
          const chords = prevChord.model.allBars.reduce((a, b) => a + b.allChords.length, 0);
          const markers = (text.match(/_/g) || []).length;
          if (markers && markers !== chords)
            warnings.push({ line: n, msg: `${markers} "_" marker(s) but chord line above has ${chords} chord(s)` });
        }
        break;
      }
      case 'emptyLine':
        if (inSection && prevType && prevType !== 'emptyLine' && prevType !== 'sectionLabel') {
          const next = lines[i + 1];
          // A blank line before an annotation (> cue, ! shout, // note) is the required placement.
          if (next && next.type !== 'sectionLabel' && next.type !== 'emptyLine' && !/^\s*(>|!|\/\/)/.test(next.string || ''))
            warnings.push({ line: n, msg: 'blank line inside a section' });
        }
        break;
      case 'keyDeclaration': case 'timeSignature': break;
      default:
        warnings.push({ line: n, msg: `unexpected line type "${l.type}"` });
    }
    prevType = l.type;
  });

  // Uneven-bar detection: chord-mark keeps such lines as chord lines but marks bars; expose it.
  lines.forEach((l, i) => {
    if (l.type !== 'chord') return;
    const ts = l.model.timeSignature?.count;
    for (const b of l.model.allBars) {
      const beats = b.allChords.reduce((a, c) => a + (c.duration || 0), 0);
      if (ts && beats !== ts && !b.isRepeated)
        warnings.push({ line: i + 1, msg: `bar "${b.allChords.map(c => c.string).join(' ')}" has ${beats} beats in ${ts}/x` });
    }
  });

  return { file: rel, errors, warnings };
}

const results = files.map(checkFile);
const bad = results.filter(r => r.errors.length);
if (json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    if (!r.errors.length && !r.warnings.length) continue;
    console.log(r.file);
    for (const e of r.errors) console.log(`  ERROR   L${e.line}: ${e.msg}`);
    for (const w of r.warnings) console.log(`  warning L${w.line}: ${w.msg}`);
  }
  console.log(`\n${files.length} file(s) checked, ${bad.length} with errors, ${results.filter(r => r.warnings.length).length} with warnings.`);
}
process.exit(bad.length ? 1 : 0);
