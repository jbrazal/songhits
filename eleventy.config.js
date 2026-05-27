const path = require('path');
const fs = require('fs');

function capitalize(w) {
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : '';
}

function slugToTitle(slug) {
  const base = slug.includes('--') ? slug.split('--')[0] : slug;
  if (/[A-Z ]/.test(base)) return base; // already has casing
  return base.split('-').map(capitalize).join(' ');
}

function slugToArtist(slug) {
  if (!slug.includes('--')) return '';
  const raw = slug.split('--')[1];
  return raw.split('-').map(capitalize).join(' ');
}

module.exports = function (eleventyConfig) {
  // ── Static assets ───────────────────────────────────────────
  eleventyConfig.addPassthroughCopy({ 'media/chord-mark.js': 'assets/chord-mark.js' });

  // ── Ignore VS Code extension files ──────────────────────────
  eleventyConfig.ignores.add('src');
  eleventyConfig.ignores.add('out');
  eleventyConfig.ignores.add('esbuild.js');
  eleventyConfig.ignores.add('CLAUDE.md');
  // Root-level .chordmark duplicates (canonical source is chordmark/)
  try {
    fs.readdirSync('.')
      .filter((f) => f.endsWith('.chordmark'))
      .forEach((f) => eleventyConfig.ignores.add(f));
  } catch {}

  // ── Custom .chordmark template format ───────────────────────
  // The raw file content becomes `content` in the layout.
  eleventyConfig.addTemplateFormats('chordmark');
  eleventyConfig.addExtension('chordmark', {
    outputFileExtension: 'html',
    compile: async (inputContent) => async () => inputContent,
  });

  // ── Filters ─────────────────────────────────────────────────
  eleventyConfig.addFilter('slugToTitle', slugToTitle);
  eleventyConfig.addFilter('slugToArtist', slugToArtist);

  // Count all songs across all parts in a setlist
  eleventyConfig.addFilter('countSongs', (parts) =>
    (parts || []).reduce((sum, p) => sum + (p.songs || []).length, 0)
  );

  // Read a chordmark file's raw source by slug (used in setlist layout)
  eleventyConfig.addFilter('songSource', (slug) => {
    if (!slug) return null;
    const p = path.join(__dirname, 'chordmark', slug + '.chordmark');
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  });

  // ── Shortcodes ──────────────────────────────────────────────
  // Builds { slug: source } map from a parts array for the setlist page
  eleventyConfig.addShortcode('setlistSongsJson', function (parts) {
    const map = {};
    for (const part of parts || []) {
      for (const song of part.songs || []) {
        if (song.slug) {
          const p = path.join(__dirname, 'chordmark', song.slug + '.chordmark');
          try { map[song.slug] = fs.readFileSync(p, 'utf8'); } catch {}
        }
      }
    }
    return JSON.stringify(map);
  });

  // ── Collections ─────────────────────────────────────────────
  eleventyConfig.addCollection('songs', (api) =>
    api
      .getFilteredByGlob('chordmark/**/*.chordmark')
      .sort((a, b) => a.fileSlug.localeCompare(b.fileSlug))
  );

  eleventyConfig.addCollection('setlists', (api) =>
    api.getFilteredByGlob('setlist/*/index.md')
  );

  // ── Eleventy config ─────────────────────────────────────────
  return {
    dir: {
      input: '.',
      output: '_site',
      includes: '_includes',
      layouts: '_includes',
    },
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk',
  };
};
