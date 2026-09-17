const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { scriptJson, metadata, setlistSources } = require('../lib/site-data');
let pages;
before(async () => {
  const { default: Eleventy } = await import('@11ty/eleventy');
  const eleventy = new Eleventy(undefined, '_site/tests'); eleventy.setIsVerbose(false);
  pages = await eleventy.toJSON();
});

function pageDom(html) {
  const dom = new JSDOM(html, { url: 'https://example.test/songhits/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  for (const script of dom.window.document.querySelectorAll('script[src]')) {
    dom.window.eval(fs.readFileSync(path.join('media', path.basename(script.src)), 'utf8'));
  }
  return dom;
}

test('only public pages are generated; all setlist IDs are unique and anchors resolve', () => {
  for (const page of pages.filter(p => p.outputPath)) {
    assert.match(page.inputPath, /^\.\/(?:index\.njk|chordmark\/|songs\/|setlist\/)/);
    if (!page.inputPath.match(/setlist\/[^/]+\/index.md$/)) continue;
    const dom = new JSDOM(page.content), document = dom.window.document;
    // Plain Markdown setlists do not use the interactive chart layout.
    if (!document.getElementById('setlist-wrap')) { dom.window.close(); continue; }
    const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
    assert.equal(new Set(ids).size, ids.length, page.inputPath);
    for (const link of document.querySelectorAll('#toc-sidebar a')) assert.ok(document.getElementById(link.hash.slice(1)));
    const sources = JSON.parse(document.getElementById('setlist-sources').textContent);
    for (const el of document.querySelectorAll('.cm-song-content')) assert.equal(typeof sources[el.dataset.slug], 'string');
    dom.window.close();
  }
});

test('script JSON round-trips hostile text without creating executable elements', () => {
  const source = '</script><script>alert(1)</script>\u2028&"';
  const dom = new JSDOM('<script type="application/json" id="data">' + scriptJson(source) + '</script>');
  assert.equal(dom.window.document.querySelectorAll('script').length, 1);
  assert.equal(JSON.parse(dom.window.document.getElementById('data').textContent), source);
  dom.window.close();
});

test('metadata retains multi-separator titles; missing charts and invalid transpose fail validation', () => {
  assert.deepEqual(metadata('ebony--ivory--freestyle'), { title: 'Ebony Ivory', artist: 'Freestyle' });
  assert.equal(metadata('dont-start-now-dua-lipa').artist, 'Dua Lipa');
  assert.throws(() => setlistSources([{ songs: [{ slug: 'not-a-real-song' }] }]), /Chart not found/);
  assert.throws(() => setlistSources([{ songs: [{ slug: '../AGENTS' }] }]), /Invalid song slug/);
  assert.throws(() => setlistSources([{ songs: [{ title: 'A', transpose: 12 }] }]), /Invalid transpose/);
});

test('all chart sources parse and render with the actual browser bundle', () => {
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync('media/chord-mark.js', 'utf8'));
  const cm = dom.window['chord-mark'];
  for (const file of fs.readdirSync('chordmark').filter(f => f.endsWith('.chordmark'))) {
    const source = fs.readFileSync(path.join('chordmark', file), 'utf8');
    assert.doesNotThrow(() => cm.renderSong(cm.parseSong(source)), file);
  }
  dom.window.close();
});

test('song controls render with blocked storage and respect dropdown/default/modifier keys', () => {
  const page = pages.find(p => p.inputPath.endsWith('/dont-start-now-dua-lipa.chordmark'));
  const dom = new JSDOM(page.content, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  Object.defineProperty(dom.window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  for (const file of ['chord-mark.js', 'site-controls.js', 'song.js']) dom.window.eval(fs.readFileSync('media/' + file, 'utf8'));
  const doc = dom.window.document;
  assert.ok(doc.querySelector('#cm-content .cmChordLine'));
  const event = new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
  doc.getElementById('sel-chart').dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(doc.getElementById('speed-val').textContent, '1.5');
  doc.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: '.', ctrlKey: true, bubbles: true }));
  assert.equal(doc.getElementById('transpose-val').textContent, '0');
  doc.getElementById('btn-up').click();
  assert.equal(doc.getElementById('transpose-val').textContent, '+1');
  assert.equal(doc.getElementById('cm-error').style.display, 'none');
  dom.window.close();
});

test('repeated setlist occurrences transpose independently and persist after rerender', () => {
  const dom = pageDom(pages.find(p => p.inputPath.includes('midyear-od/index.md')).content);
  const document = dom.window.document, blocks = [...document.querySelectorAll('.song-block')];
  const original = blocks[1].querySelector('.cm-song-content').innerHTML;
  const select = blocks[0].querySelector('select'); select.value = '2';
  select.dispatchEvent(new dom.window.Event('change'));
  assert.notEqual(blocks[0].querySelector('.cm-song-content').innerHTML, original);
  assert.equal(blocks[1].querySelector('.cm-song-content').innerHTML, original);
  document.getElementById('sel-chart').dispatchEvent(new dom.window.Event('change'));
  assert.equal(blocks[0].dataset.transpose, '2');
  assert.equal(blocks[1].dataset.transpose, '0');
  dom.window.close();
});

test('syntax highlighting distinguishes ordinary A-G lyrics from chord lines', () => {
  const grammar = JSON.parse(fs.readFileSync('syntaxes/chordmark.tmLanguage.json', 'utf8'));
  const chordLine = new RegExp(grammar.repository['chord-line'].match);
  for (const lyric of ['And I love you', 'Good morning', 'Baby come back', 'Never again']) assert.equal(chordLine.test(lyric), false);
  for (const chords of ['Am.. F..', 'Cmaj7 F G Am', '%', '[C G] Am F', 'NC']) assert.equal(chordLine.test(chords), true, chords);
});

test('offline download embeds scripts and preserves occurrence transpositions', async () => {
  const dom = pageDom(pages.find(p => p.inputPath.includes('midyear-od/index.md')).content);
  const document = dom.window.document;
  let download;
  dom.window.Blob = Blob;
  dom.window.URL.createObjectURL = blob => { download = blob; return 'blob:offline-test'; };
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () {};
  dom.window.fetch = async url => ({ ok: true, text: async () => fs.readFileSync(path.join('media', path.basename(url)), 'utf8') });
  const select = document.querySelector('.song-transpose'); select.value = '3';
  select.dispatchEvent(new dom.window.Event('change'));
  await document.getElementById('btn-offline').onclick();
  assert.ok(download, document.getElementById('offline-status').textContent);
  const html = await download.text();
  const offline = new JSDOM(html, { url: 'file:///offline.html', runScripts: 'outside-only', pretendToBeVisual: true });
  offline.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  assert.equal(offline.window.document.querySelectorAll('script[src], link').length, 0);
  for (const script of offline.window.document.querySelectorAll('script:not([type="application/json"])')) offline.window.eval(script.textContent);
  assert.equal(offline.window.document.querySelector('.song-transpose').value, '3');
  assert.ok(offline.window.document.querySelector('.cm-song-content .cmChordLine'));
  assert.equal(offline.window.document.getElementById('btn-offline').hidden, true);
  offline.window.close(); dom.window.close();
});
