(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const storage = {
    get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ } }
  };
  function handlesKeyboard(event) {
    return !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey &&
      !event.target.closest('input, select, textarea, button, a, [contenteditable]:not([contenteditable="false"])');
  }
  const fonts = {
    mono: [['Courier', "'Courier New', Courier, monospace"]],
    prop: [['Verdana', 'Verdana, Geneva, sans-serif'], ['Arial', 'Arial, sans-serif'], ['Segoe UI', "'Segoe UI', system-ui, sans-serif"], ['Roboto', "'Roboto', sans-serif"], ['Montserrat', "'Montserrat', sans-serif"], ['Nunito', "'Nunito', sans-serif"], ['Inter', "'Inter', sans-serif"], ['Open Sans', "'Open Sans', sans-serif"], ['Helvetica Neue', "'Helvetica Neue', Helvetica, Arial, sans-serif"], ['Futura', "'Futura', 'Century Gothic', sans-serif"]]
  };
  function preferences(onChange) {
    const state = {};
    for (const [key, choices] of Object.entries({ symbolType: ['chord', 'roman'], chartType: ['all', 'lyrics', 'chords', 'chordsFirstLyricLine'] })) {
      const saved = storage.get('sh-' + key, choices[0]);
      state[key] = choices.includes(saved) ? saved : choices[0];
    }
    function updateFont() {
      const mode = state.chartType === 'lyrics' ? 'prop' : 'mono';
      const key = mode === 'prop' ? 'sh-fontProp' : 'sh-fontMono';
      const choices = fonts[mode];
      const saved = storage.get(key, choices[0][1]);
      const select = byId('sel-font');
      select.replaceChildren(...choices.map(([label, value]) => new Option(label, value)));
      select.value = choices.some(f => f[1] === saved) ? saved : choices[0][1];
      document.documentElement.style.setProperty('--chart-font', select.value);
    }
    for (const [id, key] of [['sel-symbol', 'symbolType'], ['sel-chart', 'chartType']]) {
      byId(id).value = state[key];
      byId(id).onchange = event => {
        state[key] = event.target.value;
        storage.set('sh-' + key, state[key]);
        updateFont(); onChange();
      };
    }
    byId('sel-font').onchange = event => {
      storage.set(state.chartType === 'lyrics' ? 'sh-fontProp' : 'sh-fontMono', event.target.value);
      document.documentElement.style.setProperty('--chart-font', event.target.value);
    };
    updateFont();
    return state;
  }
  function performanceControls({ playId, bodyId, sizeId }) {
    const playButton = byId(playId);
    let playing = false, speed = 1.5, frame, lastTime = null, carry = 0;
    const sizes = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28];
    let sizeIndex = 4;
    function stop() {
      playing = false; cancelAnimationFrame(frame); lastTime = null;
      playButton.textContent = '▶ Play'; playButton.classList.remove('playing');
      playButton.setAttribute('aria-pressed', 'false');
    }
    function tick(time) {
      if (!playing) return;
      if (lastTime !== null) {
        // Do not skip a song when returning from a suspended tab.
        carry += speed * Math.min(time - lastTime, 100) * 0.045;
        const pixels = Math.floor(carry);
        if (pixels > 0) { window.scrollBy({ top: pixels, behavior: 'instant' }); carry -= pixels; }
      }
      lastTime = time;
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) { stop(); return; }
      frame = requestAnimationFrame(tick);
    }
    function toggle() {
      if (playing) { stop(); return; }
      playing = true; lastTime = null; carry = 0;
      playButton.textContent = '⏸ Pause'; playButton.classList.add('playing');
      playButton.setAttribute('aria-pressed', 'true'); frame = requestAnimationFrame(tick);
    }
    function setSpeed(value) {
      speed = Math.round(Math.max(0.2, Math.min(8, Number(value) || 1.5)) * 10) / 10;
      byId('speed-slider').value = speed; byId('speed-val').textContent = speed.toFixed(1);
    }
    function zoom(delta) {
      sizeIndex = Math.max(0, Math.min(sizes.length - 1, sizeIndex + delta));
      byId(bodyId).style.fontSize = sizes[sizeIndex] + 'px';
      byId(sizeId).textContent = sizes[sizeIndex] + 'px';
    }
    function top() { stop(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    playButton.onclick = toggle;
    byId('btn-slower').onclick = () => setSpeed(speed - 0.5);
    byId('btn-faster').onclick = () => setSpeed(speed + 0.5);
    byId('speed-slider').oninput = event => setSpeed(event.target.value);
    byId('btn-zoom-out').onclick = () => zoom(-1);
    byId('btn-zoom-in').onclick = () => zoom(1);
    byId('btn-top').onclick = top;
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    window.addEventListener('pagehide', stop);
    window.addEventListener('beforeprint', stop);
    document.addEventListener('keydown', event => {
      if (!handlesKeyboard(event)) return;
      const actions = { ' ': toggle, ArrowUp: () => setSpeed(speed + 0.5), ArrowDown: () => setSpeed(speed - 0.5), Home: top, '+': () => zoom(1), '=': () => zoom(1), '-': () => zoom(-1) };
      if (Object.hasOwn(actions, event.key)) { event.preventDefault(); actions[event.key](); }
    });
    setSpeed(speed); zoom(0); stop();
    return { stop };
  }
  function tempo(source, explicit) {
    const bpm = explicit || Number((source.match(/^tempo:\s*(\d+)/mi) || [])[1]);
    return Number.isFinite(bpm) && bpm > 0 && bpm <= 400 ? bpm : null;
  }
  function blink(bpm) {
    const element = byId('tempo-blinker');
    element.classList.toggle('active', !!bpm);
    element.title = bpm ? bpm + ' BPM' : '';
    if (bpm) element.style.animationDuration = 60 / bpm + 's';
  }
  function renderer() {
    const parsed = new Map();
    return (source, options) => {
      if (!parsed.has(source)) parsed.set(source, window['chord-mark'].parseSong(source));
      return window['chord-mark'].renderSong(parsed.get(source), {
        alignBars: true, printBarSeparators: 'always', printChordsDuration: 'uneven', ...options
      });
    };
  }
  function syncHeight(id, variable) {
    const element = byId(id);
    const update = () => document.documentElement.style.setProperty(variable, element.offsetHeight + 'px');
    update(); window.addEventListener('resize', update);
    if (window.ResizeObserver) new ResizeObserver(update).observe(element);
  }
  window.SongHits = { byId, storage, handlesKeyboard, preferences, performanceControls, tempo, blink, renderer, syncHeight };
})();
