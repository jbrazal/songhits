// ChordMark annotations: sigil-prefixed lyric lines promoted to styled blocks after render.
// Loads in the browser (window.SongHits.annotations) and in Node (require) for the linter and tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SongHits = root.SongHits || {}).annotations = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const ROLES = ['drums', 'bass', 'keys', 'gtr', 'vox', 'foh', 'dj', 'hype'];
  const ROLE_LABELS = { drums: 'Drums', bass: 'Bass', keys: 'Keys', gtr: 'Guitar', vox: 'Vocals', foh: 'FOH', dj: 'DJ', hype: 'Hype' };
  const MATCHERS = [
    { kind: 'note', re: /^\/\/\s*(.*)$/ },
    { kind: 'shout', re: /^!\s*(.*)$/ },
    { kind: 'cue', re: /^>([a-z]*)(?:\s+(.*))?$/i },
  ];
  // Sigil must be the first non-blank character; anything else is an ordinary lyric.
  function parseLine(raw) {
    const line = String(raw).trim();
    for (const { kind, re } of MATCHERS) {
      const match = line.match(re);
      if (!match) continue;
      const role = kind === 'cue' ? (match[1] || '').toLowerCase() : '';
      const text = (kind === 'cue' ? match[2] : match[1]) || '';
      return { kind, role, text: text.trim() };
    }
    return null;
  }
  function chips(text) {
    const bars = text.match(/\b(\d+)\s*bars?\b/i);
    const reps = text.match(/(?:^|[\s,;(])[x×](\d+)\b/i);
    return [bars && bars[1] + ' bars', reps && '×' + reps[1]].filter(Boolean);
  }
  // Promote annotation lyric lines in place. Idempotent: promoted lines no longer hold a .cmLyricLine.
  function annotate(root, { slug = '(unknown)' } = {}) {
    let count = 0;
    for (const span of root.querySelectorAll('p.cmLine > span.cmLyricLine')) {
      const anno = parseLine(span.textContent);
      if (!anno) continue;
      let { kind, role, text } = anno;
      if (role && !ROLES.includes(role)) {
        console.warn('[chordmark] ' + slug + ': unknown role "' + role + '" — rendering as untagged cue');
        role = '';
      }
      const doc = span.ownerDocument, line = span.parentElement;
      line.className = 'cmLine cmAnno cmAnno--' + kind;
      line.dataset.role = role;
      const parts = [];
      const make = (className, content) => { const el = doc.createElement('span'); el.className = className; el.textContent = content; return el; };
      if (role) parts.push(make('cmAnnoRole', ROLE_LABELS[role] || role));
      parts.push(make('cmAnnoText', text));
      for (const chip of chips(text)) parts.push(make('cmAnnoChip', chip));
      line.replaceChildren(...parts);
      count++;
    }
    return count;
  }
  // Classes that let display modes filter with CSS on a single full render.
  function markLines(root) {
    for (const line of root.querySelectorAll('p.cmLine')) {
      if (line.querySelector(':scope > .cmChordLine')) line.classList.add('cmLine--chord');
      else if (line.querySelector(':scope > .cmLyricLine')) line.classList.add('cmLine--lyric');
    }
    for (const section of root.querySelectorAll('.cmSection')) {
      const first = section.querySelector('.cmLine--lyric');
      if (first) first.classList.add('cmLine--firstLyric');
    }
  }
  function rolesPresent(root) {
    return [...new Set([...root.querySelectorAll('.cmAnno--cue[data-role]')].map(el => el.dataset.role).filter(Boolean))];
  }
  function stripNotes(root) {
    root.querySelectorAll('.cmAnno--note').forEach(el => el.remove());
  }
  // Per-player view rules, generated from ROLES so the list is maintained in one place.
  function roleStyles() {
    // Same specificity as the per-role rules below, which come later and therefore win.
    return ['[data-view] .cmAnno--cue:not([data-role=""]) { display: none; }']
      .concat(ROLES.map(role => '[data-view="' + role + '"] .cmAnno--cue[data-role="' + role + '"] { display: flex; }'))
      .join('\n');
  }
  function installStyles(doc) {
    if (doc.getElementById('cm-anno-roles')) return;
    const style = doc.createElement('style');
    style.id = 'cm-anno-roles'; style.textContent = roleStyles();
    doc.head.append(style);
  }
  return { ROLES, ROLE_LABELS, parseLine, chips, annotate, markLines, rolesPresent, stripNotes, roleStyles, installStyles };
});
