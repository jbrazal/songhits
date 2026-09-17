const { metadata } = require('../lib/site-data');
module.exports = {
  layout: 'song.njk', tags: ['songs'],
  permalink: data => '/songs/' + data.page.fileSlug + '/',
  eleventyComputed: {
    title: data => metadata(data.page.fileSlug).title,
    artist: data => metadata(data.page.fileSlug).artist,
    tempo: data => metadata(data.page.fileSlug).tempo || null,
  },
};
