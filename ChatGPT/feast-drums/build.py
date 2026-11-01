"""Render the 7 November 2026 Feast rehearsal drum parts.

Only kick, closed hi-hat and snare are synthesized. Arrangement lengths are
explicit estimates from the repo's charts and rehearsal workbook, not an
attempt to synchronize to commercial recordings.
"""

from __future__ import annotations

import json
import math
import struct
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parent
SAMPLE_RATE = 44_100
GAP_SECONDS = 2.0


@dataclass(frozen=True)
class Section:
    label: str
    bars: int
    feel: str


@dataclass(frozen=True)
class Song:
    slug: str
    title: str
    bpm: int
    sections: tuple[Section, ...]


def s(label: str, bars: int, feel: str) -> Section:
    return Section(label, bars, feel)


SONGS = (
    Song("01-turn-it-up", "Turn It Up", 124, (
        s("Intro x2", 8, "full"), s("Verse 1", 6, "groove"),
        s("Pre-Chorus 1", 8, "build"), s("Chorus 1", 7, "full"),
        s("Interlude", 1, "full"), s("Verse 2", 4, "groove"),
        s("Pre-Chorus 2", 8, "build"), s("Chorus x2", 14, "full"),
        s("Interlude x2", 8, "full"), s("Bridge", 15, "groove"),
        s("Chorus x2", 14, "full"), s("Outro", 2, "ending"),
    )),
    Song("02-christ-is-my-rock", "Christ Is My Rock", 148, (
        s("Acoustic intro", 4, "silent"), s("Verse 1", 8, "silent"),
        s("Pre-Chorus 1", 6, "build"), s("Chorus 1", 8, "full"),
        s("Interlude", 2, "full"), s("Verse 2", 8, "groove"),
        s("Pre-Chorus 2", 6, "build"), s("Chorus x2", 16, "full"),
        s("Instrumental", 4, "full"), s("Bridge x4", 32, "groove"),
        s("Tag", 4, "full"), s("Chorus", 8, "full"),
        s("Bridge x2", 16, "groove"), s("Tag", 4, "full"),
        s("Ending swell", 1, "ending"),
    )),
    Song("03-goodness-of-god", "Goodness Of God", 63, (
        s("Acoustic intro", 4, "silent"), s("Verse 1", 11, "silent"),
        s("Chorus 1", 9, "light"), s("Verse 2", 11, "groove"),
        s("Chorus 2", 9, "full"), s("Bridge x2", 32, "full"),
        s("Acoustic chorus", 9, "silent"),
        s("Final chorus", 10, "full"), s("Tag", 3, "light"),
        s("Ending swell", 1, "ending"),
    )),
    Song("04-never-walk-alone", "Never Walk Alone", 72, (
        s("Acoustic intro", 2, "silent"), s("Verse 1", 5, "silent"),
        s("Verse 2", 5, "silent"), s("Chorus 1", 14, "light"),
        s("Verse 3", 5, "groove"), s("Chorus 2", 14, "full"),
        s("Prayer instrumental", 8, "light"),
        s("Bridge x2", 20, "full"), s("Tag", 2, "ending"),
        s("Acoustic chorus", 14, "silent"),
        s("All-in chorus", 14, "full"), s("Bridge", 10, "full"),
        s("Tag 1", 2, "groove"), s("Tag 2", 2, "groove"),
        s("Ending", 3, "ending"),
    )),
    Song("05-turn-it-up-closing", "Turn It Up - Closing", 124, (
        s("Soft spoken loop", 4, "light"), s("Intro x2", 8, "full"),
        s("Verse 1", 6, "groove"), s("Pre-Chorus", 8, "build"),
        s("Chorus x2", 14, "full"), s("Outro", 2, "ending"),
    )),
)


def drum_samples() -> dict[str, np.ndarray]:
    rng = np.random.default_rng(20261107)
    t = np.arange(int(SAMPLE_RATE * 0.5), dtype=np.float64) / SAMPLE_RATE
    # Falling sine pitch, short body, and a soft beater transient.
    phase = 2 * np.pi * (48 * t + 105 * 0.033 * (1 - np.exp(-t / 0.033)))
    kick = np.sin(phase) * np.exp(-t * 21)
    kick += 0.13 * rng.standard_normal(t.size) * np.exp(-t * 110)
    kick *= 0.78

    n = int(SAMPLE_RATE * 0.25)
    snare_t = np.arange(n) / SAMPLE_RATE
    noise = rng.standard_normal(n)
    snare = (0.55 * noise * np.exp(-snare_t * 24)
             + 0.28 * np.sin(2 * np.pi * 185 * snare_t) * np.exp(-snare_t * 28))
    snare[:120] *= np.linspace(0, 1, 120)
    snare *= 0.56

    n = int(SAMPLE_RATE * 0.105)
    hat_t = np.arange(n) / SAMPLE_RATE
    noise = rng.standard_normal(n)
    high_pass = noise - np.convolve(noise, np.ones(21) / 21, mode="same")
    hat = high_pass * np.exp(-hat_t * 85) * 0.37
    hat[:40] *= np.linspace(0, 1, 40)
    return {"kick": kick.astype(np.float32),
            "snare": snare.astype(np.float32),
            "hat": hat.astype(np.float32)}


def events_for(song: Song) -> tuple[list[tuple[float, str, float]], list[dict]]:
    beat = 60 / song.bpm
    bar_length = beat * 4
    events: list[tuple[float, str, float]] = []
    sections = []
    # The count-in is one bar of four closed hats.
    for b in range(4):
        events.append((b * beat, "hat", 0.8 if b == 0 else 0.6))
    bar_cursor = 1
    for section in song.sections:
        sections.append({"section": section.label, "bar": bar_cursor + 1,
                         "seconds": round(bar_cursor * bar_length, 3),
                         "bars": section.bars, "feel": section.feel})
        for local_bar in range(section.bars):
            bar_time = (bar_cursor + local_bar) * bar_length
            feel = section.feel
            if feel == "silent":
                continue
            if feel == "ending":
                if local_bar == 0:
                    events.append((bar_time, "kick", 0.72))
                    events.append((bar_time, "hat", 0.45))
                continue
            if feel == "light":
                for eighth in range(8):
                    events.append((bar_time + eighth * beat / 2, "hat", 0.20 if eighth % 2 else 0.28))
                events.append((bar_time, "kick", 0.52))
                events.append((bar_time + 2 * beat, "snare", 0.32))
                continue
            strength = 0.72 if feel == "groove" else 0.88
            if feel == "build":
                strength = 0.58 + 0.32 * (local_bar + 1) / section.bars
            for eighth in range(8):
                hat_velocity = (0.35 if eighth % 2 else 0.48) * strength
                events.append((bar_time + eighth * beat / 2, "hat", hat_velocity))
            for b in (0, 2):
                events.append((bar_time + b * beat, "kick", strength))
            if feel in ("full", "build"):
                events.append((bar_time + 2.5 * beat, "kick", strength * 0.42))
            for b in (1, 3):
                events.append((bar_time + b * beat, "snare", strength * 0.82))
        bar_cursor += section.bars
    return events, sections


def render_wav(song: Song, path: Path, samples: dict[str, np.ndarray]) -> tuple[float, list[dict]]:
    events, sections = events_for(song)
    duration = (1 + sum(sec.bars for sec in song.sections)) * 4 * 60 / song.bpm + 0.65
    total = math.ceil(duration * SAMPLE_RATE)
    out = np.zeros(total, dtype=np.float32)
    for when, instrument, velocity in events:
        sample = samples[instrument]
        pos = round(when * SAMPLE_RATE)
        end = min(pos + len(sample), total)
        out[pos:end] += sample[:end - pos] * velocity
    # Consistent headroom and a tiny start/end fade for clean playback.
    out *= min(1, 0.87 / max(float(np.max(np.abs(out))), 1e-9))
    fade = min(256, len(out) // 2)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    pcm = np.clip(out * 32767, -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())
    return duration, sections


def variable_length(value: int) -> bytes:
    parts = [value & 0x7F]
    value >>= 7
    while value:
        parts.insert(0, (value & 0x7F) | 0x80)
        value >>= 7
    return bytes(parts)


def midi_file(song: Song, path: Path) -> None:
    ticks_per_beat = 480
    midi_events: list[tuple[int, int, bytes]] = []
    tempo = round(60_000_000 / song.bpm)
    midi_events.append((0, 0, b"\xff\x51\x03" + tempo.to_bytes(3, "big")))
    midi_events.append((0, 0, b"\xff\x58\x04\x04\x02\x18\x08"))
    events, sections = events_for(song)
    for section in sections:
        tick = (section["bar"] - 1) * 4 * ticks_per_beat
        label = section["section"].encode("utf-8")
        midi_events.append((tick, 0, b"\xff\x06" + variable_length(len(label)) + label))
    notes = {"kick": 36, "snare": 38, "hat": 42}
    for seconds, instrument, velocity in events:
        tick = round(seconds * song.bpm / 60 * ticks_per_beat)
        note = notes[instrument]
        v = max(1, min(127, round(velocity * 110)))
        midi_events.append((tick, 2, bytes((0x99, note, v))))
        midi_events.append((tick + 30, 1, bytes((0x89, note, 0))))
    midi_events.sort(key=lambda item: (item[0], item[1]))
    track = bytearray()
    previous = 0
    for tick, _, data in midi_events:
        track.extend(variable_length(tick - previous))
        track.extend(data)
        previous = tick
    track.extend(b"\x00\xff\x2f\x00")
    header = b"MThd" + struct.pack(">IHHH", 6, 0, 1, ticks_per_beat)
    path.write_bytes(header + b"MTrk" + struct.pack(">I", len(track)) + track)


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def main() -> None:
    samples = drum_samples()
    manifest = []
    input_paths = []
    for song in SONGS:
        wav = ROOT / f"{song.slug}.wav"
        mp3 = ROOT / f"{song.slug}.mp3"
        duration, sections = render_wav(song, wav, samples)
        ffmpeg("-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "192k", str(mp3))
        midi_file(song, ROOT / f"{song.slug}.mid")
        input_paths.append(wav)
        manifest.append({"title": song.title, "bpm": song.bpm,
                         "bars": 1 + sum(sec.bars for sec in song.sections),
                         "duration_seconds": round(duration, 3),
                         "file": mp3.name, "midi": f"{song.slug}.mid",
                         "sections": sections})
    # Merge the exact PCM tracks with two seconds between songs. Keep the WAVs
    # as lossless masters; MP3 is the portable rehearsal copy.
    concat = ROOT / "feast-2026-11-07-kick-hat-snare.wav"
    gap = b"\x00\x00" * round(GAP_SECONDS * SAMPLE_RATE)
    with wave.open(str(concat), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        offset = 0.0
        for index, wav_path in enumerate(input_paths):
            if index:
                out.writeframes(gap)
                offset += GAP_SECONDS
            manifest[index]["set_start_seconds"] = round(offset, 3)
            with wave.open(str(wav_path), "rb") as inp:
                while data := inp.readframes(65_536):
                    out.writeframes(data)
                offset += inp.getnframes() / SAMPLE_RATE
    ffmpeg("-i", str(concat), "-codec:a", "libmp3lame", "-b:a", "192k",
           str(ROOT / "feast-2026-11-07-kick-hat-snare.mp3"))
    (ROOT / "cue-sheet.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Rendered {len(SONGS)} songs, {offset / 60:.1f} minutes total")


if __name__ == "__main__":
    main()
