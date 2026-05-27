function capitalize(w) {
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : '';
}

function slugToTitle(slug) {
  const base = slug.includes('--') ? slug.split('--')[0] : slug;
  if (/[A-Z ]/.test(base)) return base;
  return base.split('-').map(capitalize).join(' ');
}

function slugToArtist(slug) {
  if (!slug.includes('--')) return '';
  return slug.split('--')[1].split('-').map(capitalize).join(' ');
}

module.exports = {
  layout: 'song.njk',
  tags: ['songs'],
  permalink: (data) => `/songs/${data.page.fileSlug}/`,
  eleventyComputed: {
    title: (data) => slugToTitle(data.page.fileSlug),
    artist: (data) => slugToArtist(data.page.fileSlug),
  },
};
