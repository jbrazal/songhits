(function () {
  'use strict';
  const ui = window.SongHits;
  const source = JSON.parse(ui.byId('song-source').textContent);
  const renderChart = ui.renderer();
  const body = ui.byId('song-body'), content = ui.byId('cm-content');
  const key = 'sh-transpose:' + body.dataset.slug;
  let transpose = Math.max(-11, Math.min(11, Math.trunc(Number(ui.storage.get(key, 0))) || 0));
  content.dataset.slug = body.dataset.slug;
  content.dataset.bpm = ui.tempo(source, Number(body.dataset.tempo)) || '';
  const controls = ui.performanceControls({ playId: 'btn-play', bodyId: 'song-body', sizeId: 'size-val', headerId: 'song-toolbar', footerId: 'scroll-controls' });
  const preferences = ui.preferences(render);
  function render() {
    const error = ui.byId('cm-error'), raw = ui.byId('cm-raw');
    try {
      content.innerHTML = renderChart(source, { ...preferences, transposeValue: transpose });
      error.style.display = raw.style.display = 'none'; content.style.display = '';
    } catch (e) {
      error.textContent = 'Parse error: ' + e.message; error.style.display = 'block';
      raw.textContent = source; raw.style.display = 'block'; content.style.display = 'none';
    }
    ui.byId('transpose-val').textContent = transpose > 0 ? '+' + transpose : transpose;
    ui.byId('btn-up').disabled = transpose === 11; ui.byId('btn-down').disabled = transpose === -11;
    controls.refresh();
  }
  function setTranspose(value) {
    transpose = Math.max(-11, Math.min(11, value)); ui.storage.set(key, transpose); render();
  }
  ui.byId('btn-up').onclick = () => setTranspose(transpose + 1);
  ui.byId('btn-down').onclick = () => setTranspose(transpose - 1);
  ui.byId('btn-reset').onclick = () => setTranspose(0);
  ui.byId('btn-pdf').onclick = () => window.print();
  document.addEventListener('keydown', event => {
    if (!ui.handlesKeyboard(event)) return;
    if (['.', ',', '0'].includes(event.key)) {
      event.preventDefault(); setTranspose(event.key === '0' ? 0 : transpose + (event.key === '.' ? 1 : -1));
    }
  });
  ui.syncHeight('scroll-controls', '--scroll-h');
  controls.setTempoContext(content);
  render();
})();
