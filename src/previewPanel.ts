import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export class ChordMarkPreviewPanel {
  private static instance: ChordMarkPreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private currentDocumentUri: vscode.Uri | undefined;
  private transposeValue = 0;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    document: vscode.TextDocument
  ) {
    this.panel = panel;
    this.context = context;
    this.currentDocumentUri = document.uri;

    const cfg = vscode.workspace.getConfiguration('chordmark.preview');
    this.transposeValue = cfg.get<number>('transposeValue') ?? 0;

    this.panel.webview.html = this.buildShell();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (msg: { command: string; value?: unknown; html?: string; title?: string }) => {
        if (msg.command === 'transpose') {
          const val = typeof msg.value === 'number' ? msg.value : 0;
          this.transposeValue = Math.max(-11, Math.min(11, val));
          const cfg = vscode.workspace.getConfiguration('chordmark.preview');
          await cfg.update('transposeValue', this.transposeValue, vscode.ConfigurationTarget.Global);
          this.sendContent(document.getText());
          return;
        }

        if (msg.command === 'renderedHtml') {
          await this.openInBrowser(
            typeof msg.html === 'string' ? msg.html : '',
            typeof msg.title === 'string' ? msg.title : 'ChordMark'
          );
        }
      },
      null,
      this.disposables
    );

    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('chordmark.preview')) {
          const cfg = vscode.workspace.getConfiguration('chordmark.preview');
          this.transposeValue = cfg.get<number>('transposeValue') ?? 0;
          const doc = this.getActiveDocument();
          if (doc) this.sendContent(doc.getText());
        }
      },
      null,
      this.disposables
    );

    this.sendContent(document.getText());
    this.panel.title = this.makeTitle(document);
  }

  // ── static API ────────────────────────────────────────────────

  static createOrShow(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument,
    column: vscode.ViewColumn
  ) {
    if (ChordMarkPreviewPanel.instance) {
      ChordMarkPreviewPanel.instance.panel.reveal(column);
      ChordMarkPreviewPanel.instance.currentDocumentUri = document.uri;
      ChordMarkPreviewPanel.instance.panel.title =
        ChordMarkPreviewPanel.instance.makeTitle(document);
      ChordMarkPreviewPanel.instance.sendContent(document.getText());
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'chordmarkPreview',
      'ChordMark Preview',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    );

    ChordMarkPreviewPanel.instance = new ChordMarkPreviewPanel(panel, context, document);
  }

  static update(document: vscode.TextDocument) {
    const inst = ChordMarkPreviewPanel.instance;
    if (!inst) return;
    if (inst.currentDocumentUri?.toString() !== document.uri.toString()) return;
    if (document.languageId !== 'chordmark') return;
    inst.sendContent(document.getText());
  }

  static dispose() {
    ChordMarkPreviewPanel.instance?.dispose();
  }

  /** Ask the webview to collect its rendered HTML and send it back for PDF export. */
  static triggerExport() {
    const inst = ChordMarkPreviewPanel.instance;
    if (!inst) return false;
    inst.panel.webview.postMessage({ command: 'getRenderedHtml' });
    return true;
  }

  // ── private helpers ───────────────────────────────────────────

  private makeTitle(document: vscode.TextDocument): string {
    return `Preview: ${path.basename(document.fileName, path.extname(document.fileName))}`;
  }

  private getActiveDocument(): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === this.currentDocumentUri?.toString()
    );
  }

  private sendContent(source: string) {
    const cfg = vscode.workspace.getConfiguration('chordmark.preview');
    const chartTypeSetting: string = cfg.get('chartType') ?? 'all';
    const chartTypeMap: Record<string, string> = {
      all: 'all',
      chordsOnly: 'chords',
      lyricsOnly: 'lyrics',
    };

    this.panel.webview.postMessage({
      command: 'render',
      source,
      options: {
        transposeValue: this.transposeValue,
        chartType: chartTypeMap[chartTypeSetting] ?? 'all',
        alignBars: cfg.get<boolean>('alignBars') ?? true,
        printBarSeparators: 'always',
        printChordsDuration: 'uneven',
      },
    });
  }

  private async openInBrowser(renderedHtml: string, title: string) {
    const cssPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.css').fsPath;
    const css = fs.readFileSync(cssPath, 'utf8');

    const fullHtml = buildPrintHtml(title, renderedHtml, css);
    const tmpFile = path.join(os.tmpdir(), `chordmark-${sanitizeFilename(title)}.html`);
    fs.writeFileSync(tmpFile, fullHtml, 'utf8');

    await vscode.env.openExternal(vscode.Uri.file(tmpFile));
  }

  private buildShell(): string {
    const webview = this.panel.webview;
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
                 script-src ${webview.cspSource} 'unsafe-inline';">
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

  <script src="${chordMarkUri}"></script>
  <script>
    (function () {
      const vscode = acquireVsCodeApi();
      const chordMark = window['chord-mark'];
      let songTitle = 'ChordMark';

      function formatTranspose(v) {
        return v > 0 ? '+' + v : String(v);
      }

      let currentTranspose = 0;

      function sendTranspose(val) {
        currentTranspose = Math.max(-11, Math.min(11, val));
        document.getElementById('transpose-display').textContent = formatTranspose(currentTranspose);
        vscode.postMessage({ command: 'transpose', value: currentTranspose });
      }

      document.getElementById('btn-up').addEventListener('click', () => sendTranspose(currentTranspose + 1));
      document.getElementById('btn-down').addEventListener('click', () => sendTranspose(currentTranspose - 1));
      document.getElementById('btn-reset').addEventListener('click', () => sendTranspose(0));

      document.getElementById('btn-pdf').addEventListener('click', () => {
        vscode.postMessage({
          command: 'renderedHtml',
          html: document.getElementById('cm-content').innerHTML,
          title: songTitle,
        });
      });

      window.addEventListener('message', (event) => {
        const msg = event.data;

        if (msg.command === 'getRenderedHtml') {
          vscode.postMessage({
            command: 'renderedHtml',
            html: document.getElementById('cm-content').innerHTML,
            title: songTitle,
          });
          return;
        }

        if (msg.command !== 'render') return;

        const errEl = document.getElementById('cm-error');
        const contentEl = document.getElementById('cm-content');

        currentTranspose = (msg.options && typeof msg.options.transposeValue === 'number')
          ? msg.options.transposeValue : 0;
        document.getElementById('transpose-display').textContent = formatTranspose(currentTranspose);

        try {
          const parsed = chordMark.parseSong(msg.source);
          const html = chordMark.renderSong(parsed, msg.options || {});
          errEl.style.display = 'none';
          errEl.textContent = '';
          contentEl.innerHTML = html || '<p class="cm-empty">Empty file</p>';

          // derive title from first section label or fall back to filename
          const label = contentEl.querySelector('.cmSectionLabel');
          if (!label) {
            const firstLine = (msg.source || '').split('\\n').find(l => l.trim());
            if (firstLine) songTitle = firstLine.replace(/^\\/\\/\\s*/, '').trim() || 'ChordMark';
          }
        } catch (err) {
          errEl.style.display = 'block';
          errEl.textContent = 'Parse error: ' + (err && err.message ? err.message : String(err));
          contentEl.innerHTML = '';
        }
      });
    })();
  </script>
</body>
</html>`;
  }

  private dispose() {
    ChordMarkPreviewPanel.instance = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
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
