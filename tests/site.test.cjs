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

function pageDom(html, before = () => {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/songhits/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  before(dom);
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
  for (const file of ['chord-mark.js', 'site-controls.js', 'annotations.js', 'song.js']) dom.window.eval(fs.readFileSync('media/' + file, 'utf8'));
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
  for (const file of ['chord-mark.js', 'site-controls.js', 'annotations.js']) dom.window.eval(fs.readFileSync('media/' + file, 'utf8'));
  return dom;
}
const annotations = require('../media/annotations.js');
const fixture = fs.readFileSync('chordmark/hupaw--dera.chordmark', 'utf8');
const isAnnotation = line => annotations.parseLine(line) !== null;
function renderFixture(source = fixture, options = {}) {
  const dom = controlsDom('<div id="chart" data-slug="test"></div>');
  const element = dom.window.document.getElementById('chart');
  dom.window.SongHits.renderer().into(element, source, { slug: 'test', ...options });
  return { dom, element };
}

test('annotations do not change the music: bar counts match the same chart with annotations deleted', () => {
  const cm = controlsDom().window['chord-mark'];
  const bars = source => {
    const out = {}; let section = '';
    for (const line of cm.parseSong(source).allLines) {
      if (line.type === 'sectionLabel') section = line.string;
      else if (line.type === 'chord') out[section] = (out[section] || 0) + line.model.allBars.length;
    }
    return out;
  };
  const stripped = fixture.split('\n').filter(line => !isAnnotation(line)).join('\n');
  assert.ok(fixture.split('\n').filter(isAnnotation).length >= 6);
  assert.deepEqual(bars(fixture), bars(stripped));
  assert.deepEqual(bars(fixture), { '#i': 8, '#v': 2, '#c': 4, '#s': 4 });
  for (const line of cm.parseSong(fixture).allLines) if (isAnnotation(line.string)) assert.equal(line.type, 'lyric', line.string);
});

test('each sigil gets its kind class; roles are tagged; unknown roles warn but still render', () => {
  const { dom, element } = renderFixture();
  const kinds = [...element.querySelectorAll('.cmAnno')].map(el => el.className.replace('cmLine ', ''));
  assert.deepEqual(kinds, ['cmAnno cmAnno--cue', 'cmAnno cmAnno--cue', 'cmAnno cmAnno--cue', 'cmAnno cmAnno--shout', 'cmAnno cmAnno--note', 'cmAnno cmAnno--cue']);
  const cues = [...element.querySelectorAll('.cmAnno--cue')];
  assert.deepEqual(cues.map(el => el.dataset.role), ['', 'drums', 'keys', 'foh']);
  assert.equal(cues[1].querySelector('.cmAnnoRole').textContent, 'Drums');
  assert.equal(cues[0].querySelector('.cmAnnoRole'), null);
  assert.deepEqual(annotations.rolesPresent(element), ['drums', 'keys', 'foh']);
  const warnings = [];
  const other = controlsDom('<div id="chart"></div>');
  other.window.console.warn = message => warnings.push(message);
  const el = other.window.document.getElementById('chart');
  other.window.SongHits.renderer().into(el, '#v\n>tuba loud\nC G\n', { slug: 'brass-song' });
  assert.equal(el.querySelector('.cmAnno--cue').dataset.role, '');
  assert.equal(el.querySelector('.cmAnnoText').textContent, 'loud');
  assert.match(warnings.join('\n'), /brass-song.*unknown role "tuba"/);
  dom.window.close(); other.window.close();
});

test('chips extract bar counts and repeats; sigils only match at the start; XSS text stays text', () => {
  assert.deepEqual(annotations.chips('4 bars of silence'), ['4 bars']);
  assert.deepEqual(annotations.chips('Hupaw, Hupaw x4'), ['×4']);
  assert.deepEqual(annotations.chips('Hupaw ×4'), ['×4']);
  assert.deepEqual(annotations.chips('kick + toms fill, 4 bars x2'), ['4 bars', '×2']);
  assert.deepEqual(annotations.chips('no numbers here'), []);
  assert.equal(annotations.parseLine('love > hate'), null);
  assert.deepEqual(annotations.parseLine('>drums  kick in  '), { kind: 'cue', role: 'drums', text: 'kick in' });
  assert.deepEqual(annotations.parseLine('>'), { kind: 'cue', role: '', text: '' });
  const { dom, element } = renderFixture('#v\nC G\n_love _> hate\n');
  assert.equal(element.querySelector('.cmAnno'), null);
  assert.equal(element.querySelector('.cmLyricLine').textContent.trim(), 'love > hate');
  // annotate() builds nodes from text, so escaped markup in a lyric stays literal text.
  const hostile = dom.window.document.createElement('div');
  hostile.innerHTML = '<p class="cmLine"><span class="cmLyricLine">&gt; &lt;script&gt;alert(1)&lt;/script&gt; &lt;b&gt;x&lt;/b&gt; now</span></p>';
  assert.equal(dom.window.SongHits.annotations.annotate(hostile), 1);
  assert.equal(hostile.querySelector('script, b'), null);
  assert.equal(hostile.querySelector('.cmAnnoText').textContent, '<script>alert(1)</script> <b>x</b> now');
  dom.window.close();
});

test('annotate is idempotent and leaves ordinary lyric nodes alone; stripNotes removes only notes', () => {
  const { dom, element } = renderFixture();
  const lyric = element.querySelector('.cmLyricLine'), text = lyric.textContent, html = element.innerHTML;
  assert.equal(dom.window.SongHits.annotations.annotate(element, { slug: 'test' }), 0);
  assert.equal(element.innerHTML, html);
  assert.equal(element.querySelector('.cmLyricLine'), lyric);
  assert.equal(lyric.textContent, text);
  const before = element.querySelectorAll('.cmAnno').length;
  annotations.stripNotes(element);
  assert.equal(element.querySelectorAll('.cmAnno--note').length, 0);
  assert.equal(element.querySelectorAll('.cmAnno').length, before - 1);
  dom.window.close();
});

test('NC bars repeat with % in the pinned chord-mark', () => {
  const cm = controlsDom().window['chord-mark'];
  const line = cm.parseSong('#v\nNC % % %\n').allLines[1];
  assert.equal(line.type, 'chord');
  assert.equal(line.model.allBars.length, 4);
  assert.deepEqual([...line.model.allBars].map(bar => bar.isRepeated), [false, true, true, true]);
  assert.equal(require('../package.json').dependencies['chord-mark'], require('../node_modules/chord-mark/package.json').version);
});

test('annotations survive every display mode; the cue view and notes toggle appear only when used', () => {
  const dom = pageDom(pages.find(p => p.inputPath.endsWith('/hupaw--dera.chordmark')).content);
  const { document, getComputedStyle, localStorage } = dom.window;
  const content = document.getElementById('cm-content'), select = document.getElementById('sel-chart');
  const display = selector => getComputedStyle(content.querySelector(selector)).display;
  for (const mode of ['chords', 'chordsFirstLyricLine', 'lyrics', 'all']) {
    select.value = mode; select.dispatchEvent(new dom.window.Event('change'));
    assert.equal(content.dataset.mode, mode);
    assert.equal(content.querySelectorAll('.cmAnno').length, 6, mode);
    assert.notEqual(display('.cmAnno--cue'), 'none', mode);
    assert.notEqual(display('.cmAnno--shout'), 'none', mode);
    assert.equal(display('.cmAnno--note'), 'none', mode);
  }
  select.value = 'chords'; select.dispatchEvent(new dom.window.Event('change'));
  assert.equal(display('.cmLine--lyric'), 'none');
  assert.notEqual(display('.cmLine--chord'), 'none');
  select.value = 'lyrics'; select.dispatchEvent(new dom.window.Event('change'));
  assert.equal(display('.cmLine--chord'), 'none');
  assert.notEqual(display('.cmLine--lyric'), 'none');
  document.getElementById('btn-up').click();
  assert.equal(content.querySelectorAll('.cmAnno').length, 6, 'annotations survive transpose');
  const switcher = document.getElementById('view-switcher');
  assert.equal(switcher.hidden, false);
  assert.deepEqual([...switcher.querySelectorAll('button')].map(b => b.textContent), ['All', 'Drums', 'Keys', 'FOH']);
  switcher.querySelectorAll('button')[1].click();
  assert.equal(document.getElementById('song-body').dataset.view, 'drums');
  assert.equal(localStorage.getItem('sh-view'), 'drums');
  assert.equal(display('.cmAnno--cue[data-role="keys"]'), 'none');
  assert.notEqual(display('.cmAnno--cue[data-role="drums"]'), 'none');
  assert.notEqual(display('.cmAnno--cue[data-role=""]'), 'none');
  const notes = document.getElementById('btn-notes');
  assert.equal(notes.hidden, false);
  notes.click();
  assert.equal(document.getElementById('song-body').dataset.notes, 'on');
  assert.notEqual(display('.cmAnno--note'), 'none');
  dom.window.close();
  const plain = pageDom(pages.find(p => p.inputPath.endsWith('/dont-start-now-dua-lipa.chordmark')).content);
  assert.equal(plain.window.document.getElementById('view-switcher').hidden, true);
  assert.equal(plain.window.document.getElementById('btn-notes').hidden, true);
  assert.equal(plain.window.document.querySelectorAll('.cmAnno').length, 0);
  plain.window.close();
});
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
  stubPrompterLayout(dom);
  document.getElementById('btn-prompter').click();
  assert.ok(document.body.classList.contains('prompter'));
  assert.match(document.querySelector('.cm-song-content').style.fontSize, /px$/);
  await document.getElementById('btn-offline').onclick();
  assert.ok(download, document.getElementById('offline-status').textContent);
  assert.equal(document.body.classList.contains('prompter'), false, 'download leaves teleprompter mode');
  const html = await download.text();
  const offline = new JSDOM(html, { url: 'file:///offline.html', runScripts: 'outside-only', pretendToBeVisual: true });
  offline.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  assert.equal(offline.window.document.querySelectorAll('script[src], link').length, 0);
  for (const script of offline.window.document.querySelectorAll('script:not([type="application/json"])')) offline.window.eval(script.textContent);
  assert.equal(offline.window.document.querySelector('.song-transpose').value, '3');
  assert.ok(offline.window.document.querySelector('.cm-song-content .cmChordLine'));
  assert.equal(offline.window.document.getElementById('btn-offline').hidden, true);
  assert.equal(offline.window.document.body.classList.contains('prompter'), false);
  for (const chart of offline.window.document.querySelectorAll('.cm-song-content')) assert.equal(chart.style.fontSize, '');
  offline.window.close(); dom.window.close();
});

// JSDOM has no text metrics: charts are 1280px wide and every glyph is 8px at the 14px base size.
const PROMPTER = { width: 1280, glyph: 8, base: 14, margin: 0.98, min: 16, max: 72 };
function stubPrompterLayout(dom) {
  const previous = dom.window.Element.prototype.getBoundingClientRect;
  dom.window.Element.prototype.getBoundingClientRect = function () {
    const rect = previous.call(this);
    if (!this.matches('#cm-content, .cm-song-content')) return rect;
    return { top: rect.top, bottom: rect.bottom, height: rect.height, left: 0, right: PROMPTER.width, width: PROMPTER.width };
  };
  dom.window.Range.prototype.getBoundingClientRect = function () {
    const width = this.toString().length * PROMPTER.glyph;
    return { top: 0, bottom: 0, height: 0, left: 0, right: width, width };
  };
}
function expectedFit(container, scale = 1) {
  let widest = 0;
  for (const line of container.querySelectorAll('.cmChordLine, .cmLyricLine, .cmSectionLabel')) widest = Math.max(widest, line.textContent.length * PROMPTER.glyph);
  return Math.min(PROMPTER.max, Math.max(PROMPTER.min, PROMPTER.base * PROMPTER.width * PROMPTER.margin / widest * scale));
}
const fontPx = element => parseFloat(element.style.fontSize);

test('teleprompter mode hides the chrome, fits the chart to the width, scales with +/- and exits with Escape', async () => {
  const dom = pageDom(pages.find(p => p.inputPath.endsWith('/dont-start-now-dua-lipa.chordmark')).content);
  stubPrompterLayout(dom);
  const doc = dom.window.document, { getComputedStyle } = dom.window, content = doc.getElementById('cm-content');
  const key = k => new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  const display = id => getComputedStyle(doc.querySelector(id)).display;
  const frame = () => new Promise(resolve => dom.window.requestAnimationFrame(resolve));
  const idle = doc.body.dispatchEvent(key('Escape'));
  assert.equal(idle, true, 'Escape is left alone outside teleprompter mode');
  doc.body.dispatchEvent(key('t'));
  assert.ok(doc.body.classList.contains('prompter'));
  assert.equal(doc.getElementById('btn-prompter').getAttribute('aria-pressed'), 'true');
  assert.equal(display('#prompter-bar'), 'flex');
  for (const id of ['nav', '#song-toolbar', '#scroll-controls']) assert.equal(display(id), 'none', id);
  const fitted = expectedFit(content);
  assert.ok(fitted > PROMPTER.min && fitted < PROMPTER.max, 'fixture exercises the unclamped range');
  assert.ok(Math.abs(fontPx(content) - fitted) < 1e-6);
  doc.body.dispatchEvent(key('+'));
  await frame();
  assert.equal(dom.window.localStorage.getItem('sh-prompter-scale'), '1.1');
  assert.ok(Math.abs(fontPx(content) - expectedFit(content, 1.1)) < 1e-6);
  assert.equal(doc.getElementById('size-val').textContent, '14px', 'the ordinary zoom ladder is untouched');
  doc.body.dispatchEvent(key('Escape'));
  assert.equal(doc.body.classList.contains('prompter'), false);
  assert.equal(content.style.fontSize, '');
  assert.equal(display('#prompter-bar'), 'none');
  assert.equal(doc.getElementById('btn-prompter').getAttribute('aria-pressed'), 'false');
  dom.window.close();
});

test('teleprompter mode tolerates missing text metrics, fullscreen and wake lock APIs', () => {
  const dom = pageDom(pages.find(p => p.inputPath.endsWith('/dont-start-now-dua-lipa.chordmark')).content);
  const doc = dom.window.document, content = doc.getElementById('cm-content');
  assert.equal(typeof dom.window.Range.prototype.getBoundingClientRect, 'undefined');
  assert.equal(dom.window.document.documentElement.requestFullscreen, undefined);
  doc.getElementById('btn-prompter').click();
  assert.ok(doc.body.classList.contains('prompter'));
  assert.equal(content.style.fontSize, '', 'unmeasurable charts keep their size');
  doc.querySelector('#prompter-bar [data-prompter="exit"]').click();
  assert.equal(doc.body.classList.contains('prompter'), false);
  dom.window.close();
});

test('setlist teleprompter sizes each chart on its own, mirrors Play, hides the TOC overlay and remembers the scale', async () => {
  const dom = pageDom(pages.find(p => p.inputPath.includes('midyear-od/index.md')).content);
  stubLayout(dom); dom.window.scrollTo = () => {}; stubPrompterLayout(dom);
  const doc = dom.window.document, charts = [...doc.querySelectorAll('.cm-song-content')];
  const frame = () => new Promise(resolve => dom.window.requestAnimationFrame(resolve));
  doc.body.classList.add('toc-on');
  doc.getElementById('btn-prompter').click();
  assert.equal(dom.window.getComputedStyle(doc.getElementById('toc-overlay')).display, 'none');
  assert.ok(charts.length > 1);
  for (const chart of charts) assert.ok(Math.abs(fontPx(chart) - expectedFit(chart)) < 1e-6, chart.dataset.slug);
  assert.ok(new Set(charts.map(fontPx)).size > 1, 'charts with different widest lines get different sizes');
  // No song here has a tempo, so a frame would stop at JSDOM's zero-height page bottom; check synchronously.
  const mirror = doc.querySelector('#prompter-bar [data-play-mirror]');
  mirror.click();
  assert.equal(doc.getElementById('btn-toggle').textContent, '⏸ Pause');
  assert.equal(mirror.textContent, '⏸ Pause');
  assert.equal(mirror.getAttribute('aria-pressed'), 'true');
  doc.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  assert.equal(mirror.textContent, '▶ Play');
  doc.querySelector('#prompter-bar [data-prompter="larger"]').click();
  await frame();
  assert.equal(dom.window.localStorage.getItem('sh-prompter-scale'), '1.1');
  doc.querySelector('#prompter-bar [data-prompter="exit"]').click();
  for (const chart of charts) assert.equal(chart.style.fontSize, '');
  assert.equal(doc.body.classList.contains('prompter'), false);
  dom.window.close();
  const seeded = pageDom(pages.find(p => p.inputPath.includes('midyear-od/index.md')).content, d => d.window.localStorage.setItem('sh-prompter-scale', '1.5'));
  stubPrompterLayout(seeded);
  seeded.window.document.getElementById('btn-prompter').click();
  const chart = seeded.window.document.querySelector('.cm-song-content');
  assert.ok(Math.abs(fontPx(chart) - expectedFit(chart, 1.5)) < 1e-6);
  seeded.window.close();
});
