const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

function harness() {
  const sent = [], writes = [], opened = [];
  let receive, configurationChanged, disposeListener, count = 0;
  const disposable = { dispose() {} };
  const uri = value => ({ fsPath: value, toString: () => value });
  const settings = { transposeValue: 0, theme: 'default' };
  const panel = { title: '', reveal() {}, dispose() { disposeListener?.(); }, onDidDispose(fn) { disposeListener = fn; return disposable; }, webview: {
    html: '', cspSource: 'test:', asWebviewUri: u => u.toString(),
    postMessage: m => { sent.push(m); return Promise.resolve(true); },
    onDidReceiveMessage: fn => { receive = fn; return disposable; }
  } };
  const vscode = {
    Uri: { joinPath: (u, ...parts) => uri([u.fsPath, ...parts].join('/')), file: uri },
    ViewColumn: { Beside: 2 }, ConfigurationTarget: { Global: 1 },
    window: { createWebviewPanel: () => panel, showErrorMessage: message => { throw new Error(message); } },
    env: { openExternal: async u => { opened.push(u.fsPath); return true; } },
    workspace: {
      getConfiguration: () => ({ get: key => settings[key], update: async (key, value) => {
        settings[key] = value; configurationChanged({ affectsConfiguration: () => true });
      } }),
      onDidChangeConfiguration: fn => { configurationChanged = fn; return disposable; }
    }
  };
  const fileSystem = { promises: {
    readFile: async () => '', mkdtemp: async prefix => prefix + ++count,
    writeFile: async (file, content) => writes.push({ file, content })
  } };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/previewPanel.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === 'vscode' ? vscode : name === 'fs' ? fileSystem : require(name) });
  const Preview = exports.ChordMarkPreviewPanel;
  const context = { extensionUri: uri('/test') };
  const document = name => ({ fileName: name + '.chordmark', uri: uri('/' + name), languageId: 'chordmark', getText: () => '#v\nC\n_' + name });
  return { Preview, context, document, settings, panel, sent, writes, opened, receive: message => receive(message) };
}

test('initial content waits for ready; transpose uses the current document after switching', async () => {
  const h = harness(), a = h.document('A'), b = h.document('B');
  h.Preview.createOrShow(h.context, a, 2);
  assert.equal(h.sent.length, 0);
  await h.receive({ command: 'ready' });
  assert.equal(h.sent.at(-1).source, a.getText());
  h.Preview.createOrShow(h.context, b, 2);
  await h.receive({ command: 'transpose', revision: h.sent.at(-1).revision, value: 2 });
  assert.equal(h.sent.at(-1).source, b.getText());
  assert.equal(h.sent.at(-1).title, 'B');
  assert.equal(h.sent.at(-1).options.transposeValue, 2);
});

test('export waits for the requested document and rejects stale HTML and acknowledgements', async () => {
  const h = harness();
  h.Preview.createOrShow(h.context, h.document('A'), 2);
  await h.receive({ command: 'ready' });
  const stale = h.sent.at(-1).revision;
  h.Preview.exportDocument(h.context, h.document('B'));
  const current = h.sent.at(-1);
  assert.equal(current.title, 'B');
  await h.receive({ command: 'rendered', revision: stale });
  assert.equal(h.sent.at(-1).command, 'render');
  await h.receive({ command: 'renderedHtml', revision: stale, html: 'WRONG' });
  assert.equal(h.writes.length, 0);
  await h.receive({ command: 'rendered', revision: current.revision });
  assert.equal(h.sent.at(-1).command, 'getRenderedHtml');
  await h.receive({ command: 'renderedHtml', revision: current.revision, html: '<p>Correct B</p>' });
  assert.match(h.writes[0].content, /<title>B<\/title>/);
  assert.match(h.writes[0].content, /Correct B/);
  assert.equal(h.opened.length, 1);
});

test('export without a preview queues until ready; subsequent exports use unique paths', async () => {
  const h = harness();
  h.Preview.exportDocument(h.context, h.document('A'));
  assert.equal(h.sent.length, 0);
  await h.receive({ command: 'ready' });
  for (let n = 0; n < 2; n++) {
    if (n) h.Preview.exportDocument(h.context, h.document('A'));
    const revision = h.sent.at(-1).revision;
    await h.receive({ command: 'rendered', revision });
    await h.receive({ command: 'renderedHtml', revision, html: '<p>A</p>' });
  }
  assert.notEqual(h.writes[0].file, h.writes[1].file);
});

test('theme is sent; render errors cancel export; disposal is idempotent', async () => {
  const h = harness(); h.settings.theme = 'print';
  h.Preview.exportDocument(h.context, h.document('A'));
  await h.receive({ command: 'ready' });
  const message = h.sent.at(-1); assert.equal(message.theme, 'print');
  await h.receive({ command: 'renderError', revision: message.revision });
  await h.receive({ command: 'renderedHtml', revision: message.revision, html: 'invalid' });
  assert.equal(h.writes.length, 0);
  h.Preview.dispose(); h.Preview.dispose();
});

test('real webview script announces readiness, renders themes, and acknowledges exact revisions', async () => {
  const h = harness(); h.Preview.createOrShow(h.context, h.document('A'), 2);
  const dom = new JSDOM(h.panel.webview.html, { runScripts: 'outside-only' });
  const outbound = [];
  dom.window.acquireVsCodeApi = () => ({ postMessage: message => outbound.push(message) });
  dom.window.eval(fs.readFileSync('media/chord-mark.js', 'utf8'));
  dom.window.eval(fs.readFileSync('media/preview.js', 'utf8'));
  assert.equal(outbound[0].command, 'ready');
  await h.receive(outbound[0]);
  const render = { ...h.sent.at(-1), theme: 'print' };
  const send = data => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data }));
  send(render);
  assert.equal(dom.window.document.title, 'A');
  assert.ok(dom.window.document.body.classList.contains('cm-theme-print'));
  assert.ok(dom.window.document.querySelector('.cmChordLine'));
  assert.equal(outbound.at(-1).command, 'rendered');
  assert.equal(outbound.at(-1).revision, render.revision);
  const count = outbound.length;
  send({ command: 'getRenderedHtml', revision: render.revision - 1 });
  assert.equal(outbound.length, count);
  send({ command: 'getRenderedHtml', revision: render.revision });
  assert.equal(outbound.at(-1).command, 'renderedHtml');
  send({ ...render, revision: render.revision + 1, theme: 'dark' });
  assert.ok(dom.window.document.body.classList.contains('cm-theme-dark'));
  assert.ok(!dom.window.document.body.classList.contains('cm-theme-print'));
  dom.window.close();
});
