(function () {
  'use strict';
  const ui = window.SongHits;
  const songs = JSON.parse(ui.byId('setlist-sources').textContent);
  const tempos = JSON.parse(ui.byId('setlist-tempos').textContent);
  const blocks = [...document.querySelectorAll('.song-block')];
  const renderChart = ui.renderer();
  const preferences = ui.preferences(renderAll);
  const setlistKey = ui.byId('setlist-wrap').dataset.setlist;
  const offline = document.documentElement.dataset.offline === 'true';
  const controls = ui.performanceControls({ playId: 'btn-toggle', bodyId: 'setlist-wrap', sizeId: 'zoom-val', headerId: 'controls' });
  for (const block of blocks) {
    if (!block.dataset.slug) continue;
    const content = block.querySelector('.cm-song-content');
    if (content) content.dataset.bpm = ui.tempo(songs[block.dataset.slug] || '', tempos[block.dataset.slug]) || '';
    const select = block.querySelector('.song-transpose');
    const key = 'sh-setlist-transpose:' + setlistKey + ':' + block.id + ':' + block.dataset.slug;
    const saved = offline ? block.dataset.transpose : ui.storage.get(key, block.dataset.transpose);
    const value = Math.max(-11, Math.min(11, Math.trunc(Number(saved)) || 0));
    for (let n = -11; n <= 11; n++) select.add(new Option(n > 0 ? '+' + n : String(n), n));
    select.value = String(value); block.dataset.transpose = String(value);
    select.onchange = () => {
      block.dataset.transpose = select.value; ui.storage.set(key, select.value); renderBlock(block);
    };
  }
  function renderBlock(block) {
    const element = block.querySelector('.cm-song-content');
    if (!element) return;
    const source = songs[block.dataset.slug];
    try {
      if (typeof source !== 'string') throw new Error('Chart not found');
      element.innerHTML = renderChart(source, { ...preferences, transposeValue: Number(block.dataset.transpose) });
    } catch (error) {
      element.replaceChildren();
      const fallback = document.createElement('pre'); fallback.className = 'cm-raw-fallback';
      fallback.textContent = 'Unable to render chart: ' + error.message + '\n\n' + (source || ''); element.append(fallback);
    }
    controls.refresh();
  }
  function renderAll() { blocks.forEach(renderBlock); }
  renderAll();
  ui.syncHeight('controls', '--ctrl-h');
  const button = ui.byId('btn-toc');
  const mobile = window.matchMedia('(max-width: 680px)');
  function isOpen() { return mobile.matches ? document.body.classList.contains('toc-on') : !document.body.classList.contains('toc-off'); }
  function setOpen(open) {
    document.body.classList.toggle('toc-on', mobile.matches && open);
    document.body.classList.toggle('toc-off', !mobile.matches && !open);
    button.classList.toggle('active', open); button.setAttribute('aria-expanded', String(open));
    ui.byId('toc-sidebar').inert = !open;
  }
  button.onclick = () => setOpen(!isOpen());
  ui.byId('toc-overlay').onclick = () => setOpen(false);
  mobile.addEventListener('change', () => setOpen(!mobile.matches));
  setOpen(!mobile.matches);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && mobile.matches && isOpen()) { setOpen(false); button.focus(); } });
  const links = new Map();
  document.querySelectorAll('#toc-sidebar a').forEach(link => {
    links.set(link.hash.slice(1), link);
    link.addEventListener('click', () => { if (mobile.matches) setOpen(false); });
  });
  function activate(block) {
    links.forEach((link, id) => {
      link.classList.toggle('active', id === block.id);
      if (id === block.id) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
    });
    controls.setTempoContext(block.querySelector('.cm-song-content'));
  }
  if (window.IntersectionObserver) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) activate(visible[0].target);
    }, { rootMargin: '-10% 0px -80% 0px', threshold: 0 });
    blocks.forEach(block => observer.observe(block));
  }
  if (blocks.length) activate(blocks[0]);
  ui.byId('btn-pdf').onclick = () => window.print();

  // A single HTML download keeps controls and all charts usable without a server.
  const download = ui.byId('btn-offline'), status = ui.byId('offline-status');
  if (offline) { download.hidden = true; status.textContent = 'Offline copy'; }
  download.onclick = async () => {
    controls.stop(); download.disabled = true; status.textContent = 'Preparing offline copy…';
    try {
      const copy = document.documentElement.cloneNode(true);
      for (const script of copy.querySelectorAll('script[src]')) {
        const response = await fetch(script.src);
        if (!response.ok) throw new Error('Could not download scripts');
        script.textContent = (await response.text()).replace(/<\/script/gi, '<\\/script');
        script.removeAttribute('src');
      }
      copy.dataset.offline = 'true';
      copy.querySelectorAll('link, nav').forEach(element => element.remove());
      copy.querySelectorAll('.song-transpose').forEach(select => select.replaceChildren());
      copy.querySelector('#btn-offline').removeAttribute('disabled');
      const blob = new Blob(['<!DOCTYPE html>\n' + copy.outerHTML], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = (setlistKey || 'setlist') + '-offline.html'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status.textContent = 'Offline copy downloaded';
    } catch (error) { status.textContent = 'Download failed: ' + error.message; }
    finally { download.disabled = false; }
  };
})();
