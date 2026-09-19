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
        const rect = line && line.getBoundingClientRect();
        // Lines hidden by the display mode take no time.
        if (line && beats > 0 && rect.height > 0) anchors.push(last = { y: rect.top + window.scrollY, seconds: beats * 60 / bpm, line });
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
    // Mirror buttons (data-play-mirror) follow the main play button, e.g. the teleprompter bar.
    function setPlaying(on) {
      for (const button of [playButton, ...document.querySelectorAll('[data-play-mirror]')]) {
        button.textContent = on ? '⏸ Pause' : '▶ Play'; button.classList.toggle('playing', on);
        button.setAttribute('aria-pressed', String(on));
      }
    }
    function stop() {
      playing = false; cancelAnimationFrame(frame); lastTime = null; highlight(null); setPlaying(false);
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
      setPlaying(true); frame = requestAnimationFrame(tick);
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
    return { stop, toggle, refresh: () => { dirty = true; }, setTempoContext };
  }

  // ── Teleprompter mode ─────────────────────────────────────────
  // Hides every bar, fits each chart's widest visible line to the screen width, and keeps the
  // screen awake. Sizes are inline per chart, so leaving restores the ordinary zoom ladder.
  const SCALE = { min: 0.5, max: 2, step: 1.1, key: 'sh-prompter-scale' };
  const FIT = { minPx: 16, maxPx: 72, margin: 0.98 };
  function prompterMode({ controls, chartSelector }) {
    const body = document.body, button = byId('btn-prompter');
    const clampScale = value => Math.min(SCALE.max, Math.max(SCALE.min, value));
    let active = false, scale = clampScale(Number(storage.get(SCALE.key, 1)) || 1), wakeLock = null, frame;
    const containers = () => [...document.querySelectorAll(chartSelector)];
    // Line spans are blocks, so only a Range reports the text extent; hidden lines measure 0.
    function lineWidth(line) {
      if (typeof Range === 'undefined' || typeof Range.prototype.getBoundingClientRect !== 'function') return 0;
      const range = document.createRange(); range.selectNodeContents(line);
      return range.getBoundingClientRect().width;
    }
    function fit() {
      const charts = containers();
      for (const container of charts) container.style.fontSize = '';
      const sizes = charts.map(container => {
        const base = parseFloat(getComputedStyle(container).fontSize) || 14;
        const available = container.getBoundingClientRect().width * FIT.margin;
        let widest = 0;
        for (const line of container.querySelectorAll('.cmChordLine, .cmLyricLine, .cmSectionLabel')) widest = Math.max(widest, lineWidth(line));
        return widest > 0 && available > 0 ? Math.min(FIT.maxPx, Math.max(FIT.minPx, base * available / widest * scale)) : null;
      });
      charts.forEach((container, i) => { if (sizes[i] !== null) container.style.fontSize = sizes[i] + 'px'; });
      controls.refresh();
    }
    function refresh() {
      if (!active) return;
      cancelAnimationFrame(frame); frame = requestAnimationFrame(fit);
    }
    function setScale(factor) {
      scale = clampScale(Math.round(scale * factor * 1000) / 1000);
      storage.set(SCALE.key, scale); refresh();
    }
    const swallow = promise => { if (promise && typeof promise.catch === 'function') promise.catch(() => {}); };
    function requestFullscreen() {
      const root = document.documentElement, request = root.requestFullscreen || root.webkitRequestFullscreen;
      if (request) try { swallow(request.call(root, { navigationUI: 'hide' })); } catch { /* Best effort. */ }
    }
    function exitFullscreen() {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if ((document.fullscreenElement || document.webkitFullscreenElement) && exit) try { swallow(exit.call(document)); } catch { /* Best effort. */ }
    }
    function requestWakeLock() {
      try { swallow(navigator.wakeLock.request('screen').then(lock => { wakeLock = lock; })); } catch { /* Not supported. */ }
    }
    function releaseWakeLock() {
      if (wakeLock) try { swallow(wakeLock.release()); } catch { /* Already released. */ }
      wakeLock = null;
    }
    function enter() {
      if (active) return;
      active = true; body.classList.add('prompter');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (button) button.setAttribute('aria-pressed', 'true');
      fit(); requestFullscreen(); requestWakeLock();
      if (document.fonts && document.fonts.ready) swallow(document.fonts.ready.then(refresh));
    }
    function exit() {
      if (!active) return;
      active = false; cancelAnimationFrame(frame); body.classList.remove('prompter');
      for (const container of containers()) container.style.fontSize = '';
      if (button) button.setAttribute('aria-pressed', 'false');
      controls.refresh(); releaseWakeLock(); exitFullscreen();
    }
    function toggle() { if (active) exit(); else enter(); }
    body.classList.remove('prompter');
    if (button) button.onclick = () => { button.blur(); toggle(); };
    const actions = { play: controls.toggle, smaller: () => setScale(1 / SCALE.step), larger: () => setScale(SCALE.step), exit };
    for (const element of document.querySelectorAll('#prompter-bar [data-prompter]')) {
      element.onclick = () => { element.blur(); actions[element.dataset.prompter](); };
    }
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
      document.addEventListener(type, () => { if (active && !document.fullscreenElement && !document.webkitFullscreenElement) exit(); });
    }
    document.addEventListener('visibilitychange', () => { if (active && !document.hidden) requestWakeLock(); });
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    // Capture phase: the other handlers skip keys this one has already claimed.
    document.addEventListener('keydown', event => {
      if (!handlesKeyboard(event)) return;
      const keys = { t: toggle, T: toggle, Escape: exit };
      if (active) Object.assign(keys, { '+': actions.larger, '=': actions.larger, '-': actions.smaller });
      if (!Object.hasOwn(keys, event.key) || (event.key === 'Escape' && !active)) return;
      event.preventDefault(); keys[event.key]();
    }, true);
    return { enter, exit, toggle, refresh, isActive: () => active };
  }
  function renderer() {
    const parsed = new Map();
    const render = (source, options) => {
      // Windows line endings would turn "4/4" into a lyric line.
      source = source.replace(/\r\n?/g, '\n');
      if (!parsed.has(source)) parsed.set(source, window['chord-mark'].parseSong(source));
      return window['chord-mark'].renderSong(parsed.get(source), {
        alignBars: true, printBarSeparators: 'always', printChordsDuration: 'uneven', ...options
      });
    };
    // The single place a chart reaches the page: render everything, promote annotations, then let
    // CSS apply the display mode. Chords align to syllables only in "all", as chord-mark does itself.
    render.into = (element, source, { chartType = 'all', slug = '', ...options } = {}) => {
      element.innerHTML = render(source, { ...options, chartType: 'all', alignChordsWithLyrics: chartType === 'all' });
      const annotations = window.SongHits.annotations;
      if (annotations) { annotations.annotate(element, { slug }); annotations.markLines(element); }
      element.dataset.mode = chartType;
    };
    return render;
  }
  // Per-player cue view and the editorial notes toggle, shown only when the chart uses them.
  function viewControls({ bodyId, switcherId, notesId }) {
    const annotations = window.SongHits.annotations, body = byId(bodyId);
    const switcher = byId(switcherId), notesButton = byId(notesId);
    annotations.installStyles(document);
    function setView(role) {
      if (role) { body.dataset.view = role; storage.set('sh-view', role); }
      else { delete body.dataset.view; storage.remove('sh-view'); }
      for (const button of switcher.querySelectorAll('button')) button.setAttribute('aria-pressed', String((button.dataset.role || '') === (role || '')));
    }
    function setNotes(on) {
      body.dataset.notes = on ? 'on' : 'off'; storage.set('sh-notes', on ? 'on' : 'off');
      notesButton.setAttribute('aria-pressed', String(on)); notesButton.classList.toggle('active', on);
    }
    function sync() {
      const roles = annotations.rolesPresent(body), saved = storage.get('sh-view', '');
      switcher.replaceChildren(...[['', 'All'], ...roles.map(role => [role, annotations.ROLE_LABELS[role] || role])].map(([role, label]) => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'ctrl-btn ctrl-btn-wide'; button.textContent = label;
        button.dataset.role = role; button.title = role ? 'Show cues for ' + label : 'Show every cue';
        button.onclick = () => setView(role);
        return button;
      }));
      switcher.hidden = roles.length === 0;
      setView(roles.includes(saved) ? saved : '');
      notesButton.hidden = !body.querySelector('.cmAnno--note');
      setNotes(storage.get('sh-notes', 'off') === 'on');
    }
    notesButton.onclick = () => setNotes(body.dataset.notes !== 'on');
    return { sync };
  }
  function syncHeight(id, variable) {
    const element = byId(id);
    const update = () => document.documentElement.style.setProperty(variable, element.offsetHeight + 'px');
    update(); window.addEventListener('resize', update);
    if (window.ResizeObserver) new ResizeObserver(update).observe(element);
  }
  window.SongHits = { ...window.SongHits, byId, storage, handlesKeyboard, preferences, performanceControls, prompterMode, viewControls, beatsPerBar, lineBeats, schedule, measure, tempo, blink, renderer, syncHeight };
})();
