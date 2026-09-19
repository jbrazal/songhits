const fs = require('node:fs');
const { scriptJson, metadata, setlistSources, validateMetadata } = require('./lib/site-data');
module.exports = function (config) {
  // New notes/tools stay private by default, including when output is overridden.
  const publicRoots = new Set(['index.njk', 'songs', 'setlist', 'chordmark', '_includes']);
  for (const entry of fs.readdirSync(__dirname)) if (!publicRoots.has(entry)) config.ignores.add(entry);
  config.ignores.add('setlist/temp/**');
  config.setTemplateFormats(['njk', 'md', 'chordmark']);
  for (const file of ['chord-mark.js', 'site-controls.js', 'annotations.js', 'song.js', 'setlist.js']) config.addPassthroughCopy({ ['media/' + file]: 'assets/' + file });
  config.addWatchTarget('./chordmark/metadata.json');
  config.on('eleventy.before', validateMetadata);
  config.addExtension('chordmark', { outputFileExtension: 'html', compile: async input => async () => input });
  config.addFilter('scriptJson', scriptJson);
  // Preserve dump | safe JSON semantics while escaping HTML script terminators.
  config.addFilter('escapeScriptJson', json => json.replace(/</g, '\\u003c'));
  config.addFilter('slugToTitle', slug => metadata(slug).title);
  config.addFilter('slugToArtist', slug => metadata(slug).artist);
  config.addFilter('countSongs', parts => (parts || []).reduce((n, p) => n + (p.songs || []).length, 0));
  config.addShortcode('setlistSongsJson', parts => scriptJson(setlistSources(parts)));
  config.addShortcode('setlistTemposJson', parts => {
    const tempos = Object.create(null);
    for (const slug of Object.keys(setlistSources(parts))) tempos[slug] = metadata(slug).tempo || null;
    return scriptJson(tempos);
  });
  config.addCollection('songs', api => api.getFilteredByGlob('chordmark/**/*.chordmark').sort((a, b) => a.fileSlug.localeCompare(b.fileSlug)));
  config.addCollection('setlists', api => api.getFilteredByGlob('setlist/*/index.md'));
  return {
    pathPrefix: '/songhits/',
    dir: { input: '.', output: 'docs', includes: '_includes', layouts: '_includes' },
    htmlTemplateEngine: 'njk', markdownTemplateEngine: 'njk',
  };
};
