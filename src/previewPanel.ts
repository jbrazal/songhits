import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { randomBytes } from 'crypto';

export class ChordMarkPreviewPanel {
  private static instance: ChordMarkPreviewPanel | undefined;
  private currentDocument: vscode.TextDocument;
  private transposeValue = 0;
  private ready = false;
  private disposed = false;
  private revision = 0;
  private exportPending = false;
  private exportRevision: number | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor(private readonly panel: vscode.WebviewPanel, private readonly context: vscode.ExtensionContext, document: vscode.TextDocument) {
    this.currentDocument = document;
    this.transposeValue = this.getTranspose();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(async msg => {
      if (!msg || typeof msg.command !== 'string' || this.disposed) return;
      if (msg.command === 'ready') { this.ready = true; this.sendContent(); }
      if (msg.command === 'transpose' && msg.revision === this.revision && Number.isFinite(msg.value)) {
        this.transposeValue = Math.max(-11, Math.min(11, Math.trunc(msg.value)));
        // Render immediately; preference persistence must not delay or change the document.
        this.sendContent();
        try { await vscode.workspace.getConfiguration('chordmark.preview').update('transposeValue', this.transposeValue, vscode.ConfigurationTarget.Global); }
        catch { /* Current preview remains usable if settings cannot be written. */ }
      }
      if (msg.command === 'export' && msg.revision === this.revision) {
        this.exportPending = true; this.sendContent();
      }
      if (msg.command === 'rendered' && msg.revision === this.revision && this.exportRevision === msg.revision) {
        this.panel.webview.postMessage({ command: 'getRenderedHtml', revision: this.revision });
      }
      if (msg.command === 'renderError' && msg.revision === this.revision) {
        this.exportPending = false; this.exportRevision = undefined;
      }
      if (msg.command === 'renderedHtml' && msg.revision === this.revision && this.exportRevision === msg.revision && typeof msg.html === 'string') {
        this.exportPending = false; this.exportRevision = undefined;
        try { await this.openInBrowser(msg.html, this.documentTitle()); }
        catch (error) { vscode.window.showErrorMessage('Unable to export chart: ' + String(error)); }
      }
    }, null, this.disposables);
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('chordmark.preview')) { this.transposeValue = this.getTranspose(); this.sendContent(); }
    }, null, this.disposables);
    // Install the host listener before loading the page. The page requests its first render.
    this.panel.title = 'Preview: ' + this.documentTitle();
    this.panel.webview.html = this.buildShell();
  }

  static createOrShow(context: vscode.ExtensionContext, document: vscode.TextDocument, column: vscode.ViewColumn) {
    if (document.languageId !== 'chordmark') return;
    const inst = this.instance;
    if (inst) {
      if (inst.currentDocument.uri.toString() !== document.uri.toString()) {
        inst.exportPending = false; inst.exportRevision = undefined;
      }
      inst.currentDocument = document;
      inst.panel.title = 'Preview: ' + inst.documentTitle();
      inst.panel.reveal(column); inst.sendContent(); return;
    }
    const panel = vscode.window.createWebviewPanel('chordmarkPreview', 'ChordMark Preview', column, {
      enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')], retainContextWhenHidden: true,
    });
    this.instance = new ChordMarkPreviewPanel(panel, context, document);
  }

  static update(document: vscode.TextDocument) {
    const inst = this.instance;
    if (!inst || document.languageId !== 'chordmark' || inst.currentDocument.uri.toString() !== document.uri.toString()) return;
    inst.currentDocument = document; inst.sendContent();
  }

  static exportDocument(context: vscode.ExtensionContext, document: vscode.TextDocument) {
    if (document.languageId !== 'chordmark') return;
    this.createOrShow(context, document, vscode.ViewColumn.Beside);
    const inst = this.instance!;
    inst.exportPending = true; inst.sendContent();
  }

  static dispose() { this.instance?.dispose(); }

  private getTranspose() {
    const value = vscode.workspace.getConfiguration('chordmark.preview').get<number>('transposeValue') ?? 0;
    return Number.isFinite(value) ? Math.max(-11, Math.min(11, Math.trunc(value))) : 0;
  }

  private documentTitle() {
    return path.basename(this.currentDocument.fileName, path.extname(this.currentDocument.fileName));
  }

  private sendContent() {
    if (!this.ready || this.disposed || this.currentDocument.isClosed) return;
    const cfg = vscode.workspace.getConfiguration('chordmark.preview');
    const chartTypes: Record<string, string> = { all: 'all', chordsOnly: 'chords', lyricsOnly: 'lyrics' };
    const theme = cfg.get<string>('theme') ?? 'default';
    const revision = ++this.revision;
    if (this.exportPending) this.exportRevision = revision;
    this.panel.webview.postMessage({
      command: 'render', revision, source: this.currentDocument.getText(), title: this.documentTitle(),
      theme: ['default', 'dark', 'print'].includes(theme) ? theme : 'default',
      options: { transposeValue: this.transposeValue, chartType: chartTypes[cfg.get<string>('chartType') ?? 'all'] ?? 'all', alignBars: cfg.get<boolean>('alignBars') ?? true, printBarSeparators: 'always', printChordsDuration: 'uneven' },
    });
  }

  private async openInBrowser(renderedHtml: string, title: string) {
    const css = await fs.promises.readFile(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.css').fsPath, 'utf8');
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'chordmark-'));
    const tmpFile = path.join(directory, sanitizeFilename(title) + '.html');
    await fs.promises.writeFile(tmpFile, buildPrintHtml(title, renderedHtml, css), 'utf8');
    if (!await vscode.env.openExternal(vscode.Uri.file(tmpFile))) throw new Error('The browser could not open the exported chart.');
  }

  private buildShell(): string {
    const webview = this.panel.webview;
    const nonce = randomBytes(16).toString('hex');
    const chordMarkUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chord-mark.js')
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.css')
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${cssUri}">
  <title>ChordMark Preview</title>
</head>
<body>
  <div class="cm-toolbar">
    <div class="cm-toolbar-group">
      <span class="cm-label">Transpose</span>
      <button class="cm-btn" id="btn-down" title="Transpose down">&#9660;</button>
      <span class="cm-transpose-value" id="transpose-display">0</span>
      <button class="cm-btn" id="btn-up" title="Transpose up">&#9650;</button>
      <button class="cm-btn cm-btn-reset" id="btn-reset" title="Reset transpose">&#8635;</button>
    </div>
    <div class="cm-toolbar-sep"></div>
    <div class="cm-toolbar-group">
      <button class="cm-btn cm-btn-pdf" id="btn-pdf" title="Open in browser to print / save as PDF">PDF</button>
    </div>
  </div>
  <div class="cm-preview-body">
    <div id="cm-error" class="cm-error" style="display:none;"></div>
    <div id="cm-content" class="cmSong"></div>
  </div>

  <script nonce="${nonce}" src="${chordMarkUri}"></script>
  <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.js'))}"></script>
</body>
</html>`;
  }

  private dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (ChordMarkPreviewPanel.instance === this) ChordMarkPreviewPanel.instance = undefined;
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables = []; this.panel.dispose();
  }
}

// ── standalone HTML builder ───────────────────────────────────────

function buildPrintHtml(title: string, body: string, css: string): string {
  // Strip the VSCode variable references from the CSS so the browser gets plain colours
  const printCss = css
    .replace(/var\(--vscode-[^,)]+,\s*([^)]+)\)/g, '$1')
    .replace(/var\(--vscode-[^)]+\)/g, 'inherit');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <style>
${printCss}

/* ---- standalone browser overrides ---- */
body {
  background: #fff;
  color: #111;
  font-family: 'Courier New', Courier, monospace;
  font-size: 14px;
  margin: 0;
  padding: 24px 40px;
  display: block;
  min-height: unset;
}
.cm-toolbar { display: none; }
.cmSong { max-width: 900px; }
.cmSectionLabel { color: #007070; border-bottom-color: #ccc; }
.cmChordLine, .cmChordSymbol { color: #7a5000; }
.cmBarSeparator { color: #aaa; opacity: 1; }
.cmLyricLine { color: #111; }
.cmChordDuration { color: #888; }

/* ---- print page setup ---- */
@media print {
  body { padding: 0; }
  @page { margin: 1.5cm 2cm; size: A4 portrait; }
  .cmSection { page-break-inside: avoid; }
}
  </style>
</head>
<body>
  <div class="cmSong">${body}</div>
  <script>window.onload = function () { window.print(); };<\/script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
}
