const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function titleCase(value) {
  if (/[A-Z ]/.test(value)) return value;
  return value.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}
function readSong(slug) {
  if (typeof slug !== 'string' || !slug || /[\\/\0]/.test(slug) || slug === '..') throw new Error('Invalid song slug: ' + slug);
  try { return fs.readFileSync(path.join(root, 'chordmark', slug + '.chordmark'), 'utf8'); }
  catch (error) { throw new Error('Chart not found for slug "' + slug + '": ' + error.message); }
}
function metadata(slug) {
  const split = slug.lastIndexOf('--');
  const fallback = { title: titleCase(split < 0 ? slug : slug.slice(0, split)), artist: split < 0 ? '' : titleCase(slug.slice(split + 2)) };
  const overrides = JSON.parse(fs.readFileSync(path.join(root, 'chordmark', 'metadata.json'), 'utf8'));
  return { ...fallback, ...(Object.hasOwn(overrides, slug) ? overrides[slug] : {}) };
}
function validateMetadata() {
  const entries = JSON.parse(fs.readFileSync(path.join(root, 'chordmark', 'metadata.json'), 'utf8'));
  for (const [slug, entry] of Object.entries(entries)) {
    readSong(slug);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid metadata for ' + slug);
    for (const [key, value] of Object.entries(entry)) {
      if (!['title', 'artist', 'tempo'].includes(key)) throw new Error('Unknown metadata field ' + key + ' for ' + slug);
      if (key === 'tempo' ? !(Number.isInteger(value) && value > 0 && value <= 400) : typeof value !== 'string' || !value.trim()) throw new Error('Invalid ' + key + ' for ' + slug);
    }
  }
}
function setlistSources(parts) {
  const map = Object.create(null);
  for (const part of parts || []) for (const song of part.songs || []) {
    if (song.transpose !== undefined && (!Number.isInteger(song.transpose) || Math.abs(song.transpose) > 11)) throw new Error('Invalid transpose for ' + song.title + ': expected an integer from -11 to 11');
    if (song.slug) map[song.slug] = readSong(song.slug);
  }
  return map;
}
module.exports = { scriptJson, metadata, readSong, setlistSources, validateMetadata };
