#!/usr/bin/env node
// Report charts that still need lyrics and setlist songs that have no chart.
// Usage: npm run lyrics:status
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const root = path.join(__dirname, '..');
const chordDir = path.join(root, 'chordmark');
const setlistDir = path.join(root, 'setlist');

const OMITTED_MARKER = /lyrics omitted/i;
const MIN_BYTES = 60; // anything smaller is a title-only or empty file

const chordOnly = [];
const empty = [];
for (const file of fs.readdirSync(chordDir).filter((f) => f.endsWith('.chordmark')).sort()) {
  const full = path.join(chordDir, file);
  const text = fs.readFileSync(full, 'utf8');
  const slug = file.replace(/\.chordmark$/, '');
  if (text.trim().length < MIN_BYTES) empty.push(slug);
  else if (OMITTED_MARKER.test(text)) chordOnly.push(slug);
}

const noChart = [];
for (const name of fs.readdirSync(setlistDir)) {
  const md = path.join(setlistDir, name, 'index.md');
  if (!fs.existsSync(md)) continue;
  const { data } = matter(fs.readFileSync(md, 'utf8'));
  for (const part of data.parts || []) {
    for (const song of part.songs || []) {
      if (!song.slug && song.title) {
        const label = song.artist ? `${song.title} — ${song.artist}` : song.title;
        noChart.push(`${label}  (setlist/${name})`);
      }
    }
  }
}

function section(title, items) {
  console.log(`\n${title} (${items.length})`);
  if (!items.length) console.log('  none');
  for (const item of items) console.log(`  - ${item}`);
}

section('Charts marked "lyrics omitted"', chordOnly);
section('Empty or title-only charts', empty);
section('Setlist songs with no chart', [...new Set(noChart)]);
console.log();
