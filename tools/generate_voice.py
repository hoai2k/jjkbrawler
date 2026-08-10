#!/usr/bin/env python3
"""Generate every spoken line in the audio request docs via the ElevenLabs API.

The sibling of tools/generate_sfx.py, and deliberately shaped like it: same
docs, same entry format, same post-processing, same mono MP3 out, same
idempotence. The difference is the endpoint — sound generation cannot speak, so
the domain call-outs go to text-to-speech instead — and one extra field per
entry, the cast voice:

  **`domain_call_gojo.wav`** · Gojo — Unlimited Void · voice `<id>` · 3.0 s
  ```
  [casually] りょういきてんかい……[pause] むりょうくうしょ。
  ```

That `· voice `id` ·` field is the whole routing rule. This tool generates only
entries that carry it; generate_sfx.py generates only entries that do not. A
line with no cast voice is not "not yet cast", it is invisible to both tools,
which is the loudest way for the omission to show up.

Lines are written in KANA, not kanji. Every domain name in this game is an
irregular reading — 蕩蘊平線 is *tau'un heisen*, 鉄囲 is *tecchi* — and a
synthesiser handed the kanji guesses at them. The kana in the doc is the
fandom furigana; it is the pronunciation guide, so it is what gets sent.

Needs an ffmpeg binary; `pip install imageio-ffmpeg` provides one.
Reads the key from ELEVENLABS_API_KEY. Idempotent: skips files that already
exist unless --force.

  ELEVENLABS_API_KEY=... python3 tools/generate_voice.py
"""
import argparse, json, os, re, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
import urllib.request, urllib.error
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# The post-processing is not merely similar to the sound-effect tool's, it is
# the same code: a line that is trimmed, capped and peak-normalised differently
# from the sting it plays over would sit wrong in the mix for reasons nobody
# could hear the cause of.
from generate_sfx import DOCS, OUT, SR, ENTRY, post_process, write_mp3

# v3 takes the bracketed cues in the doc as performance direction. Everything
# else the library offers is worse here: the older models ignore the cues, and
# these eight lines are cast for their delivery.
MODEL = "eleven_v3"

# Stability 0.5 is "natural" — v3's three-position control, the middle one.
# "creative" wanders off the cue and "robust" flattens it, and a domain call-out
# is a performance with one take.
VOICE_SETTINGS = {"stability": 0.5, "similarity_boost": 0.85, "use_speaker_boost": True}

VOICE_FIELD = re.compile(r"·\s*voice\s+`([A-Za-z0-9]+)`")


def parse_doc():
    """-> [(filename, voice_id, seconds, text)], open requests first.

    Only entries carrying a `· voice `id` ·` field: everything else in these
    docs is a sound effect and belongs to generate_sfx.py.
    """
    out, seen = [], set()
    for doc in DOCS:
        if not os.path.exists(doc):
            continue
        for m in ENTRY.finditer(open(doc).read()):
            name, header = m.group(1), m.group(2)
            voice = VOICE_FIELD.search(header)
            if name in seen or not voice:
                continue
            seen.add(name)
            out.append((name, voice.group(1), float(m.group(3)), m.group(4).strip()))
    return out


def request_mp3(text, voice_id, key):
    """-> mp3 bytes. PCM output is a Pro-tier format, so this asks for MP3 at
    the highest bitrate available and decodes it below; the file ships as MP3
    anyway, so the only cost is one extra generation of lossy encoding."""
    body = json.dumps({
        "text": text,
        "model_id": MODEL,
        "voice_settings": VOICE_SETTINGS,
    }).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        "?output_format=mp3_44100_128",
        data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def decode(mp3_bytes):
    """-> raw signed-16 PCM at SR, mono, so post_process sees exactly what it
    sees from the sound-generation endpoint."""
    from generate_sfx import _ffmpeg
    tmp = tempfile.mktemp(suffix=".mp3")
    with open(tmp, "wb") as f:
        f.write(mp3_bytes)
    try:
        return subprocess.run(
            [_ffmpeg(), "-v", "error", "-i", tmp, "-f", "s16le",
             "-acodec", "pcm_s16le", "-ac", "1", "-ar", str(SR), "-"],
            check=True, capture_output=True).stdout
    finally:
        os.path.exists(tmp) and os.remove(tmp)


def one(entry, key, force):
    name, voice_id, seconds, text = entry
    dest = os.path.join(OUT, name.replace(".wav", ".mp3"))
    if os.path.exists(dest) and not force:
        return name, "skip", os.path.getsize(dest)
    for attempt in range(4):
        try:
            # cap=False: the sound-effect tool cuts a runaway result back to
            # length, which is right for an impact and wrong for a sentence —
            # it lands mid-word. A line is as long as it is performed; the
            # length in the doc is the brief, and the check below reports a
            # miss rather than hiding it by truncating.
            x = post_process(decode(request_mp3(text, voice_id, key)),
                             seconds, cap=False)
            if x is None:
                return name, "EMPTY", 0
            write_mp3(dest, x)
            got = x.size / SR
            over = "" if got <= seconds * 1.15 else f" OVER {seconds:.1f}s brief"
            return name, f"ok {got:.2f}s{over}", os.path.getsize(dest)
        except urllib.error.HTTPError as e:
            detail = e.read()[:200].decode("utf8", "replace")
            if e.code in (429, 500, 502, 503) and attempt < 3:
                import time; time.sleep(2 ** attempt * 3)
                continue
            return name, f"HTTP {e.code}: {detail}", 0
        except Exception as e:
            if attempt < 3:
                import time; time.sleep(2 ** attempt * 2)
                continue
            return name, f"ERR {e}", 0
    return name, "FAILED", 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated filenames")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()

    # The key is read from the environment and never stored in the repo.
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        sys.exit("set ELEVENLABS_API_KEY (never commit it)")
    os.makedirs(OUT, exist_ok=True)
    entries = parse_doc()
    if a.only:
        want = set(a.only.split(","))
        entries = [e for e in entries if e[0] in want]
    print(f"{len(entries)} lines to speak", flush=True)

    fails = []
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for name, status, size in ex.map(lambda e: one(e, key, a.force), entries):
            print(f"  {name:32} {status:22} {size:>7}B", flush=True)
            if not status.startswith(("ok", "skip")):
                fails.append((name, status))
    print(f"\ndone. failures: {len(fails)}")
    for n, s in fails:
        print("  FAIL", n, s)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
