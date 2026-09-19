#!/usr/bin/env node
/**
 * Lint ChordMark annotations (> cue, >role cue, ! shout, // note) for placement and consistency.
 *
 * Usage:  node scripts/lint-chordmark.cjs [file-or-dir ...]     (default: chordmark/)
 *
 * Rules:
 *   anno-after-chordline  error  annotation directly follows a chord line (absorbed into its layout)
 *   anno-splits-lyric     error  annotation sits between a chord line and its "_"-marked lyric line
 *   reserved-prefix       error  annotation text begins with #, :, %, \ or [
 *   unknown-role          warn   >role not in the site role list
 *   bar-count-prose       warn   cue says "N bars" but the following chord block has a different count
 *   empty-anno            warn   sigil with no text after it
 * Exit code 1 if any file has errors; warnings alone exit 0.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const annotations = require('../media/annotations.js');

const ROOT = path.resolve(__dirname, '..');
const dom = new JSDOM('', { runScripts: 'outside-only' });
dom.window.eval(fs.readFileSync(path.join(ROOT, 'media', 'chord-mark.js'), 'utf8'));
const cm = dom.window['chord-mark'];

const targets = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!targets.length) targets.push('chordmark');
const files = [];
for (const target of targets) {
  const p = path.resolve(ROOT, target);
  if (fs.statSync(p).isDirectory()) {
    for (const f of fs.readdirSync(p)) if (f.endsWith('.chordmark')) files.push(path.join(p, f));
  } else files.push(p);
}

// Classify raw lines with the real parser so chord detection matches the site.
function classify(lines) {
  let lastChordBars = 0;
  return lines.map(raw => {
    const text = raw.trim();
    if (!text) return { type: 'blank' };
    const anno = annotations.parseLine(text);
    if (anno) return { type: 'anno', ...anno };
    if (text.startsWith('#')) return { type: 'section' };
    if (text === '%') return { type: 'chord', bars: lastChordBars };
    try {
      const line = cm.parseSong('#v\n' + text).allLines[1];
      if (line.type === 'chord') { lastChordBars = line.model.allBars.length; return { type: 'chord', bars: lastChordBars }; }
      return { type: line.type, marked: line.type === 'lyric' && text.includes('_') };
    } catch { return { type: 'lyric', marked: text.includes('_') }; }
  });
}

function lint(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const info = classify(lines);
  const problems = [];
  const report = (level, index, rule, msg) => problems.push({ level, line: index + 1, rule, msg });
  info.forEach((entry, i) => {
    if (entry.type !== 'anno') return;
    if (!entry.text) report('warning', i, 'empty-anno', 'annotation has no text');
    if (entry.role && !annotations.ROLES.includes(entry.role)) report('warning', i, 'unknown-role', `unknown role "${entry.role}" (known: ${annotations.ROLES.join(', ')})`);
    if (/^[#:%\\[]/.test(entry.text)) report('error', i, 'reserved-prefix', `annotation text must not begin with "${entry.text[0]}"`);
    if (i > 0 && info[i - 1].type === 'chord') {
      let j = i + 1;
      while (j < info.length && info[j].type === 'anno') j++;
      if (j < info.length && info[j].type === 'lyric' && info[j].marked) report('error', i, 'anno-splits-lyric', 'annotation sits between a chord line and its "_"-marked lyric line');
      else report('error', i, 'anno-after-chordline', 'annotation directly follows a chord line; put it above the chord line with a blank line before it');
    }
    const bars = entry.kind === 'cue' && entry.text.match(/\b(\d+)\s*bars?\b/i);
    if (bars) {
      let j = i + 1, total = 0, found = false;
      while (j < info.length && info[j].type === 'anno') j++;
      while (j < info.length && info[j].type === 'chord') { total += info[j].bars; found = true; j++; }
      if (found && total !== Number(bars[1])) report('warning', i, 'bar-count-prose', `cue says ${bars[1]} bars but the following chord block has ${total}`);
    }
  });
  return problems;
}

let errorFiles = 0, warnFiles = 0;
for (const file of files) {
  const problems = lint(fs.readFileSync(file, 'utf8'));
  if (!problems.length) continue;
  const errors = problems.filter(p => p.level === 'error').length;
  if (errors) errorFiles++; else warnFiles++;
  console.log(path.relative(ROOT, file));
  for (const p of problems) console.log(`  ${p.level === 'error' ? 'ERROR  ' : 'warning'} L${p.line}: ${p.rule}: ${p.msg}`);
}
console.log(`\n${files.length} file(s) linted, ${errorFiles} with errors, ${warnFiles} with warnings.`);
process.exit(errorFiles ? 1 : 0);
