"""Convert pipe-bar chord sheets (|G   |Am7/C  | with lyrics aligned underneath) to ChordMark.

Usage: python scripts/txt2chordmark.py IN.txt OUT.chordmark
Each |cell| is one bar; several chords in a cell split the bar evenly. The column where a chord
starts becomes a "_" marker at the same column of the lyric line below.
"""
import html, re, sys

HEADERS = [
    (r'intro', '#i'), (r'verse', '#v'), (r'pre-?\s?chorus', '#p'), (r'post-?\s?chorus', '#PostChorus'),
    (r'pre-?\s?verse', '#PreVerse'), (r'chorus', '#c'), (r'bridge', '#b'), (r'interlude', '#Interlude'),
    (r'outro|fade\s?out', '#o'), (r'refrain', '#Refrain'), (r'guitar solo|solo', '#s'),
    (r'instrumental', '#Instrumental'), (r'break', '#Break'), (r'hook', '#Hook'),
]
HEADER_RE = re.compile(r'^#?\s*\[?(' + '|'.join(h for h, _ in HEADERS) + r')\b', re.I)
CHORD_TOKEN = re.compile(r"^[A-G][#b]?[A-Za-z0-9#b+°ø()\-]*(/[A-G][#b]?)?$|^N\.?C\.?$")


def read(path):
    raw = open(path, 'rb').read()
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        text = raw.decode('cp1252')
    return html.unescape(text.replace('\r\n', '\n').replace('\r', '\n'))


def header_label(line):
    m = HEADER_RE.match(line.strip())
    if not m:
        return None
    word = m.group(1).lower()
    for pat, label in HEADERS:
        if re.fullmatch(pat, word, re.I):
            return label
    return None


def norm_chord(c):
    c = re.sub(r'^N\.?C\.?$', 'NC', c)
    c = c.replace('(add', 'add').replace(')', '') if '(add' in c else c
    return c


def parse_chord_line(line):
    """Return list of (column, chordmark_bar_string) or None if not a pipe chord line."""
    if '|' not in line:
        return None
    cells = []
    pos = 0
    parts = line.split('|')
    # parts[0] is text before the first pipe (indentation), last part after final pipe
    col = len(parts[0]) + 1
    for cell in parts[1:-1]:
        toks = [(m.start() + col, m.group()) for m in re.finditer(r'\S+', cell)]
        cells.append((col, toks))
        col += len(cell) + 1
    if not cells:
        return None
    bars = []
    for col, toks in cells:
        if not toks:
            continue
        chords = [norm_chord(t) for _, t in toks]
        if not all(CHORD_TOKEN.match(c) for c in chords):
            return None
        if len(chords) == 1:
            bars.append((toks[0][0], chords[0]))
        elif len(chords) == 2:
            bars.append((toks[0][0], chords[0] + '..'))
            bars.append((toks[1][0], chords[1] + '..'))
        elif len(chords) == 4:
            for (c, _), ch in zip(toks, chords):
                bars.append((c, ch + '.'))
        elif len(chords) == 3:
            bars.append((toks[0][0], chords[0] + '..'))
            bars.append((toks[1][0], chords[1] + '.'))
            bars.append((toks[2][0], chords[2] + '.'))
        else:
            return None
    return bars


def dash_chord_line(line):
    """'D-A/C#-Bm-A x2' or 'D  A  Bm  Bb A x2' -> ['D A/C# Bm A', '%']"""
    m = re.match(r'^\s*([A-G][^\s]*(?:[\s\-]+[A-G][^\s]*)*)\s*(?:x(\d+))?\s*$', line)
    if not m:
        return None
    chords = [norm_chord(c) for c in re.split(r'[\s\-]+', m.group(1).strip()) if c]
    if not all(CHORD_TOKEN.match(c) for c in chords):
        return None
    out = [' '.join(chords)]
    out += ['%'] * (int(m.group(2) or 1) - 1)
    return out


def mark_lyric(lyric, cols):
    if not cols:
        return lyric.rstrip()
    s = lyric.rstrip('\n')
    out, last = [], 0
    for c in cols:
        if c > len(s):
            s = s + ' ' * (c - len(s))
        out.append(s[last:c])
        last = c
    out.append(s[last:])
    res = '_'.join(out)
    res = re.sub(r'^\s+', '', res)
    res = re.sub(r'^_\s+', '_', res)
    res = re.sub(r'\s+_\s+', ' _', res)
    res = re.sub(r'\s{2,}', ' ', res)
    return res.rstrip()


def convert(text):
    lines = text.split('\n')
    out = []
    pending_cols = None      # columns of the chord line just emitted, awaiting a lyric line
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            pending_cols = None
            if out and out[-1] != '':
                out.append('')
            i += 1
            continue
        if stripped.lower().startswith('strumming pattern') or re.match(r'^(tuning|capo|key)\b', stripped, re.I):
            i += 1
            continue
        label = header_label(stripped)
        if label and (not out or out[-1] == ''):
            out.append(label)
            while i + 1 < len(lines) and not lines[i + 1].strip():
                i += 1
            # "Intro: D--Bm--G--A--" style inline chords are dropped (they are re-stated as bars below)
            pending_cols = None
            i += 1
            continue
        bars = parse_chord_line(line)
        if bars:
            out.append(' '.join(b for _, b in bars))
            pending_cols = [c for c, _ in bars]
            i += 1
            continue
        dash = dash_chord_line(line)
        if dash:
            out.extend(dash)
            pending_cols = None
            i += 1
            continue
        # lyric
        if pending_cols is not None:
            out.append(mark_lyric(line, pending_cols))
            pending_cols = None
        else:
            l = re.sub(r'\s{2,}', ' ', line.strip())
            if l.startswith('#'):
                l = ':' + l
            out.append(l)
        i += 1
    # tidy: drop leading blanks, collapse multiple blanks, ensure trailing newline
    text = '\n'.join(out)
    text = re.sub(r'\n{3,}', '\n\n', text).strip('\n') + '\n'
    return text


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    open(dst, 'w', encoding='utf-8', newline='\n').write(convert(read(src)))
