Remove blank lines that appear within sections (between chord and lyric lines) across all `.chordmark` files in the `chordmark/` directory. Section separators (blank lines immediately before `#` section headers) are preserved.

Run this Python script:

```python
import glob

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')

    while lines and lines[-1].strip() == '':
        lines.pop()

    result = []
    i = 0

    while i < len(lines):
        line = lines[i]
        if line.strip() == '':
            blank_start = i
            j = i
            while j < len(lines) and lines[j].strip() == '':
                j += 1

            prev_non_blank = None
            for k in range(len(result) - 1, -1, -1):
                if result[k].strip() != '':
                    prev_non_blank = result[k]
                    break

            next_non_blank = lines[j] if j < len(lines) else None

            if (prev_non_blank is not None
                    and not prev_non_blank.lstrip().startswith('#')
                    and next_non_blank is not None
                    and next_non_blank.lstrip().startswith('#')):
                result.extend(lines[blank_start:j])

            i = j
        else:
            result.append(line)
            i += 1

    new_content = '\n'.join(result) + '\n'
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8', newline='') as f:
            f.write(new_content)
        return True
    return False

changed = []
for fp in sorted(glob.glob('chordmark/*.chordmark')):
    if process_file(fp):
        changed.append(fp)

if changed:
    print(f"Cleaned {len(changed)} files:")
    for f in changed:
        print(f"  {f}")
else:
    print("All files already clean.")
```

Report which files were modified and how many.
