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

function controlsDom(html = '') {
  const dom = new JSDOM(html, { url: 'https://example.test/songhits/', runScripts: 'outside-only', pretendToBeVisual: true });
  for (const file of ['chord-mark.js', 'site-controls.js']) dom.window.eval(fs.readFileSync('media/' + file, 'utf8'));
  return dom;
}
// JSDOM has no layout: give every chart line a 20px slot and containers a matching box.
function stubLayout(dom) {
  dom.window.Element.prototype.getBoundingClientRect = function () {
    const lines = [...this.ownerDocument.querySelectorAll('.cmLine')], total = lines.length * 20;
    if (this.matches('.cmLine')) { const top = lines.indexOf(this) * 20; return { top, bottom: top + 20, height: 20, left: 0, right: 0, width: 0 }; }
    if (this.matches('[data-bpm]')) return { top: 0, bottom: total, height: total, left: 0, right: 0, width: 0 };
    return { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0 };
  };
}

test('beat counting follows chord-mark bar rules and inline time signatures stay line-local', () => {
  const dom = controlsDom(), ui = dom.window.SongHits, cm = dom.window['chord-mark'];
  const root = dom.window.document.createElement('div');
  root.innerHTML = cm.renderSong(cm.parseSong('#v\n4/4\nC G\nx\nC 3/4 D\nE F\n6/8\nG A\n'), { printBarSeparators: 'always' });
  let ts = '4/4';
  const beats = [];
  for (const el of root.querySelectorAll('.cmChordLine, .cmLine > .cmTimeSignature')) {
    if (el.classList.contains('cmTimeSignature')) ts = el.textContent.trim(); else beats.push(ui.lineBeats(el, ts));
  }
  assert.deepEqual(beats, [8, 7, 8, 4]);
  assert.deepEqual(['3/4', '6/8', '12/8', '2/2', 'junk'].map(ui.beatsPerBar), [3, 2, 4, 4, 4]);
  dom.window.close();
});

test('measure builds tempo anchors in document order and skips charts without tempo or chord lines', () => {
  const dom = controlsDom('<div id="a" data-bpm="120" data-slug="a"></div><div id="b" data-bpm="" data-slug="b"></div><div id="c" data-bpm="90"></div>');
  const ui = dom.window.SongHits, cm = dom.window['chord-mark'], document = dom.window.document, render = ui.renderer();
  stubLayout(dom);
  const source = '#v\n4/4\nC G\nx\n3/4\nD E F\ny\n';
  document.getElementById('a').innerHTML = render(source, {});
  document.getElementById('b').innerHTML = render(source, {});
  document.getElementById('c').innerHTML = render(source, { chartType: 'lyrics' });
  const bpmOf = container => Number(container.dataset.bpm) || null;
  const anchors = ui.measure(document.body, bpmOf);
  assert.deepEqual([...anchors].map(a => a.seconds), [4, 4.5, null]);
  assert.ok(anchors[0].y < anchors[1].y && anchors[1].y < anchors[2].y);
  assert.ok(anchors[0].line.classList.contains('cmLine') && anchors[2].line === null);
  assert.ok(cm.parseSong(source).allLines.some(line => line.type === 'timeSignature'));
  dom.window.close();
});

test('schedule maps time to pixels and back, with constant-rate spans between tempo anchors', () => {
  const { schedule } = controlsDom().window.SongHits;
  const plan = schedule([{ y: 100, seconds: 2, line: null }, { y: 200, seconds: null, line: null }], 335, 67.5);
  const lead = 100 / 67.5;
  assert.ok(Math.abs(plan.points[1].t - lead) < 1e-9);
  assert.equal(plan.yAt(lead + 1), 150);
  assert.ok(Math.abs(plan.tAt(150) - (lead + 1)) < 1e-9);
  assert.ok(Math.abs(plan.tempoEnd - (lead + 2)) < 1e-9);
  assert.ok(Math.abs(plan.duration - (lead + 4)) < 1e-9);
  for (const t of [0, 0.7, lead, lead + 1.3, lead + 3, 99]) assert.ok(Math.abs(plan.tAt(plan.yAt(t)) - Math.min(t, plan.duration)) < 1e-9, String(t));
  assert.equal(schedule([], 1000, 67.5).yAt(1), 67.5);
  assert.equal(schedule([], 1000, 67.5).tempoEnd, null);
  const flat = schedule([{ y: 0, seconds: 1, line: null }, { y: 0, seconds: null, line: null }], 0, 67.5);
  assert.ok(Number.isFinite(flat.yAt(0.5)) && Number.isFinite(flat.tAt(0)));
});

test('songs with a tempo expose a BPM control, remember adjustments, and highlight the playing line', async () => {
  const dom = pageDom(pages.find(p => p.inputPath.endsWith('/manchild.chordmark')).content);
  const doc = dom.window.document, key = e => new dom.window.KeyboardEvent('keydown', { key: e, bubbles: true, cancelable: true });
  assert.ok(doc.querySelector('#cm-content .cmLine > .cmTimeSignature'), 'CRLF chart keeps its time signature line');
  assert.equal(doc.getElementById('speed-label').textContent, 'Tempo');
  assert.equal(doc.getElementById('speed-val').textContent, '123 BPM');
  assert.equal(doc.getElementById('tempo-blinker').style.animationDuration, 60 / 123 + 's');
  doc.body.dispatchEvent(key('ArrowUp'));
  assert.equal(doc.getElementById('speed-val').textContent, '124 BPM');
  assert.equal(doc.getElementById('tempo-blinker').style.animationDuration, 60 / 124 + 's');
  assert.equal(dom.window.localStorage.getItem('sh-bpm:manchild'), '124');
  doc.getElementById('btn-speed-reset').click();
  assert.equal(doc.getElementById('speed-val').textContent, '123 BPM');
  assert.equal(dom.window.localStorage.getItem('sh-bpm:manchild'), null);
  stubLayout(dom); dom.window.scrollTo = () => {};
  const frame = () => new Promise(resolve => dom.window.requestAnimationFrame(resolve));
  doc.body.dispatchEvent(key(' '));
  await frame(); await frame();
  assert.equal(doc.getElementById('btn-play').textContent, '⏸ Pause');
  assert.ok(doc.querySelector('#cm-content .cmLine.cm-playhead .cmChordLine'));
  doc.body.dispatchEvent(key(' '));
  assert.equal(doc.querySelector('.cm-playhead'), null);
  assert.equal(doc.getElementById('btn-play').textContent, '▶ Play');
  dom.window.close();
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
