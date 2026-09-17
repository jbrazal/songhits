(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const chordMark = window['chord-mark'];
  const byId = id => document.getElementById(id);
  let revision = 0, transpose = 0, rendered = false, previousSource, parsed;
  function sendTranspose(value) {
    transpose = Math.max(-11, Math.min(11, value));
    vscode.postMessage({ command: 'transpose', revision, value: transpose });
  }
  byId('btn-up').onclick = () => sendTranspose(transpose + 1);
  byId('btn-down').onclick = () => sendTranspose(transpose - 1);
  byId('btn-reset').onclick = () => sendTranspose(0);
  byId('btn-pdf').disabled = true;
  byId('btn-pdf').onclick = () => { if (rendered) vscode.postMessage({ command: 'export', revision }); };
  window.addEventListener('message', ({ data: msg }) => {
    if (msg.command === 'getRenderedHtml') {
      if (rendered && msg.revision === revision) vscode.postMessage({ command: 'renderedHtml', revision, html: byId('cm-content').innerHTML });
      return;
    }
    if (msg.command !== 'render') return;
    revision = msg.revision; transpose = msg.options.transposeValue; rendered = false;
    document.title = msg.title;
    document.body.classList.remove('cm-theme-dark', 'cm-theme-print');
    if (msg.theme !== 'default') document.body.classList.add('cm-theme-' + msg.theme);
    byId('transpose-display').textContent = transpose > 0 ? '+' + transpose : transpose;
    byId('btn-up').disabled = transpose === 11; byId('btn-down').disabled = transpose === -11;
    try {
      if (msg.source !== previousSource) { parsed = chordMark.parseSong(msg.source); previousSource = msg.source; }
      byId('cm-content').innerHTML = chordMark.renderSong(parsed, msg.options) || '<p class="cm-empty">Empty file</p>';
      byId('cm-error').style.display = 'none'; rendered = true;
      vscode.postMessage({ command: 'rendered', revision });
    } catch (error) {
      byId('cm-error').style.display = 'block'; byId('cm-error').textContent = 'Parse error: ' + error.message;
      byId('cm-content').replaceChildren(); vscode.postMessage({ command: 'renderError', revision });
    }
    byId('btn-pdf').disabled = !rendered;
  });
  vscode.postMessage({ command: 'ready' });
})();
