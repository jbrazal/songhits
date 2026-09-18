(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const storage = {
    get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* Preferences are optional. */ } }
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

  // ── Musical timing ────────────────────────────────────────────
  // Beats per bar as chord-mark counts them: x/2 doubles, x/8 groups eighths in threes.
  function beatsPerBar(ts) {
    const [count, value] = String(ts || '').split('/').map(Number);
    if (!(count > 0) || !(value > 0)) return 4;
    return value === 2 ? count * 2 : value === 8 ? count / 3 : count;
  }
  // Inline time signature changes only apply within their own line.
  function lineBeats(chordLine, ts = '4/4') {
    let beats = 0, separators = 0;
    for (const element of chordLine.querySelectorAll('.cmBarSeparator, .cmTimeSignature')) {
      if (element.classList.contains('cmTimeSignature')) ts = element.textContent.trim();
      else if (separators++ > 0) beats += beatsPerBar(ts);
    }
    return beats;
  }
  // Anchors: { y, seconds, line } sorted by y. seconds === null means "scroll at baseRate px/s".
  function schedule(anchors, pageEnd, baseRate) {
    const points = [{ y: 0, seconds: null, line: null }];
    for (const anchor of [...anchors].sort((a, b) => a.y - b.y)) if (anchor.y >= points[points.length - 1].y) points.push({ ...anchor });
    if (pageEnd > points[points.length - 1].y) points.push({ y: pageEnd, seconds: null, line: null });
    let tempoEnd = null;
    points[0].t = 0;
    for (let i = 0; i < points.length; i++) {
      const point = points[i], next = points[i + 1];
      point.dur = next ? (point.seconds ?? (next.y - point.y) / baseRate) : 0;
      if (next) next.t = point.t + point.dur;
      if (next && point.seconds !== null) tempoEnd = next.t;
    }
    const clamp = value => Math.min(1, Math.max(0, value));
    const indexAt = t => { let i = 0; while (i + 1 < points.length && points[i + 1].t <= t) i++; return i; };
    function yAt(t) {
      const i = indexAt(t), point = points[i], next = points[i + 1];
      return !next || !point.dur ? point.y : point.y + (next.y - point.y) * clamp((t - point.t) / point.dur);
    }
    function tAt(y) {
      let i = 0; while (i + 1 < points.length && points[i + 1].y <= y) i++;
      const point = points[i], next = points[i + 1];
      return !next || next.y === point.y ? point.t : point.t + point.dur * clamp((y - point.y) / (next.y - point.y));
    }
    return { points, duration: points[points.length - 1].t, tempoEnd, indexAt, yAt, tAt, lineAt: t => points[indexAt(t)].line };
  }
  // Chart containers carry data-bpm; bpmOf(container) may apply a per-song override.
  function measure(root, bpmOf) {
    const anchors = [];
    for (const container of root.querySelectorAll('[data-bpm]')) {
      const bpm = bpmOf(container), box = container.getBoundingClientRect();
      if (!(bpm > 0) || !box.height) continue;
      let ts = '4/4', last = null;
      for (const element of container.querySelectorAll('.cmChordLine, .cmLine > .cmTimeSignature')) {
        if (element.classList.contains('cmTimeSignature')) { ts = element.textContent.trim(); continue; }
        const line = element.closest('.cmLine'), beats = lineBeats(element, ts);
        if (line && beats > 0) anchors.push(last = { y: line.getBoundingClientRect().top + window.scrollY, seconds: beats * 60 / bpm, line });
      }
      if (last) anchors.push({ y: Math.max(last.y, box.bottom + window.scrollY), seconds: null, line: null });
    }
    return anchors;
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

  // ── Autoscroll, zoom and the shared speed/tempo control ───────
  const SPEED = { min: 0.2, max: 8, step: 0.1, nudge: 0.5, initial: 1.5, pxPerUnit: 45 };
  const BPM = { min: 40, max: 240, step: 1, nudge: 1 };
  function performanceControls({ playId, bodyId, sizeId, headerId, footerId }) {
    const playButton = byId(playId), slider = byId('speed-slider'), label = byId('speed-label');
    let playing = false, speed = SPEED.initial, frame, lastTime = null;
    let t = 0, lastSet = 0, holdUntil = 0, dirty = true, plan = null, eye = 0, lit = null;
    let context = { slug: null, written: null };
    const sizes = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28];
    let sizeIndex = 4;
    function override(slug) {
      const value = Math.round(Number(storage.get('sh-bpm:' + slug, NaN)));
      return value >= BPM.min && value <= BPM.max ? value : null;
    }
    function bpmOf(container) {
      const written = Number(container.dataset.bpm) || null;
      return written && container.dataset.slug ? override(container.dataset.slug) ?? written : written;
    }
    const effectiveBpm = () => context.written && (context.slug ? override(context.slug) ?? context.written : context.written);
    function eyeLine() {
      const header = headerId && byId(headerId), footer = footerId && byId(footerId);
      const top = header ? header.getBoundingClientRect().bottom : 0;
      const bottom = window.innerHeight - (footer ? footer.offsetHeight : 0);
      return top + Math.max(0, bottom - top) * 0.3;
    }
    function highlight(line) {
      if (lit === line) return;
      if (lit) lit.classList.remove('cm-playhead');
      if (line) line.classList.add('cm-playhead');
      lit = line;
    }
    function remeasure() {
      dirty = false;
      const previous = plan && plan.points[plan.indexAt(t)];
      eye = eyeLine();
      plan = schedule(measure(byId(bodyId), bpmOf), document.documentElement.scrollHeight, speed * SPEED.pxPerUnit);
      if (!previous) return;
      // Keep the musical position through zooms, re-renders and tempo changes.
      const same = previous.line && plan.points.find(point => point.line === previous.line);
      t = same ? same.t + same.dur * (previous.dur ? (t - previous.t) / previous.dur : 0) : plan.tAt(window.scrollY + eye);
    }
    function stop() {
      playing = false; cancelAnimationFrame(frame); lastTime = null; highlight(null);
      playButton.textContent = '▶ Play'; playButton.classList.remove('playing');
      playButton.setAttribute('aria-pressed', 'false');
    }
    function tick(time) {
      if (!playing) return;
      // Do not skip a song when returning from a suspended tab.
      const dt = lastTime === null ? 0 : Math.min(time - lastTime, 100);
      lastTime = time;
      if (dirty) remeasure();
      if (Math.abs(window.scrollY - lastSet) > 1) { t = plan.tAt(window.scrollY + eye); holdUntil = time + 400; }
      if (time >= holdUntil) { t += dt / 1000; window.scrollTo({ top: Math.max(0, plan.yAt(t) - eye), behavior: 'instant' }); }
      lastSet = window.scrollY;
      highlight(plan.lineAt(t));
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (t >= plan.duration || (atBottom && (plan.tempoEnd === null || t >= plan.tempoEnd))) { stop(); return; }
      frame = requestAnimationFrame(tick);
    }
    function toggle() {
      if (playing) { stop(); return; }
      playing = true; lastTime = null; plan = null; remeasure();
      const first = plan.points.find(point => point.seconds !== null);
      t = window.scrollY <= 0 && first ? first.t : plan.tAt(window.scrollY + eye);
      lastSet = window.scrollY; holdUntil = 0;
      playButton.textContent = '⏸ Pause'; playButton.classList.add('playing');
      playButton.setAttribute('aria-pressed', 'true'); frame = requestAnimationFrame(tick);
    }
    function showControl() {
      const bpm = effectiveBpm();
      if (label) label.textContent = bpm ? 'Tempo' : 'Speed';
      slider.min = bpm ? BPM.min : SPEED.min; slider.max = bpm ? BPM.max : SPEED.max; slider.step = bpm ? BPM.step : SPEED.step;
      slider.value = bpm || speed;
      slider.setAttribute('aria-label', bpm ? 'Tempo in BPM' : 'Autoscroll speed');
      byId('speed-val').textContent = bpm ? bpm + ' BPM' : speed.toFixed(1);
      byId('speed-val').title = bpm ? 'Written tempo ' + context.written + ' BPM' : '';
      blink(bpm);
    }
    function setValue(value) {
      if (context.written) {
        const bpm = Math.round(Math.max(BPM.min, Math.min(BPM.max, Number(value) || context.written)));
        if (context.slug) { if (bpm === context.written) storage.remove('sh-bpm:' + context.slug); else storage.set('sh-bpm:' + context.slug, bpm); }
        else context.written = bpm;
      } else {
        speed = Math.round(Math.max(SPEED.min, Math.min(SPEED.max, Number(value) || SPEED.initial)) * 10) / 10;
      }
      dirty = true; showControl();
    }
    function nudge(direction) {
      const bpm = effectiveBpm();
      setValue(bpm ? bpm + direction * BPM.nudge : speed + direction * SPEED.nudge);
    }
    function reset() { setValue(context.written || SPEED.initial); }
    function setTempoContext(container) {
      context = { slug: (container && container.dataset.slug) || null, written: container ? Number(container.dataset.bpm) || null : null };
      dirty = true; showControl();
    }
    function zoom(delta) {
      sizeIndex = Math.max(0, Math.min(sizes.length - 1, sizeIndex + delta));
      byId(bodyId).style.fontSize = sizes[sizeIndex] + 'px';
      byId(sizeId).textContent = sizes[sizeIndex] + 'px';
      dirty = true;
    }
    function top() { stop(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    playButton.onclick = toggle;
    byId('btn-slower').onclick = () => nudge(-1);
    byId('btn-faster').onclick = () => nudge(1);
    slider.oninput = event => setValue(event.target.value);
    const resetButton = byId('btn-speed-reset');
    if (resetButton) resetButton.onclick = reset;
    byId('btn-zoom-out').onclick = () => zoom(-1);
    byId('btn-zoom-in').onclick = () => zoom(1);
    byId('btn-top').onclick = top;
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    window.addEventListener('pagehide', stop);
    window.addEventListener('beforeprint', stop);
    window.addEventListener('resize', () => { dirty = true; });
    if (window.ResizeObserver) new ResizeObserver(() => { dirty = true; }).observe(byId(bodyId));
    document.addEventListener('keydown', event => {
      if (!handlesKeyboard(event)) return;
      const actions = { ' ': toggle, ArrowUp: () => nudge(1), ArrowDown: () => nudge(-1), Home: top, '+': () => zoom(1), '=': () => zoom(1), '-': () => zoom(-1) };
      if (Object.hasOwn(actions, event.key)) { event.preventDefault(); actions[event.key](); }
    });
    showControl(); zoom(0); stop();
    return { stop, refresh: () => { dirty = true; }, setTempoContext };
  }
  function renderer() {
    const parsed = new Map();
    return (source, options) => {
      // Windows line endings would turn "4/4" into a lyric line.
      source = source.replace(/\r\n?/g, '\n');
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
  window.SongHits = { byId, storage, handlesKeyboard, preferences, performanceControls, beatsPerBar, lineBeats, schedule, measure, tempo, blink, renderer, syncHeight };
})();
