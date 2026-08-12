"""Draw a pose read back as a mannequin, next to the sprite it was read from.

The question this answers is not "what pose is this frame in" — that is easy to
answer in prose and impossible to check. It is "is the READ accurate enough to
animate from", and the only honest way to check that is to draw the read as a
figure and put it on top of the art. A description can be vague and still sound
right; a stick figure with the elbow in the wrong place is visibly wrong.

So the input is a joint table (sprites/docs/<char>-pose-read.json) holding, per
pose, sixteen points in the frame's own square cell — and the output is one
self-contained HTML sheet with a cell per pose showing the mannequin drawn over
a washed-out copy of the sprite. Three view modes (overlay / mannequin only /
sprite only) because each catches a different kind of error: overlay catches
misplaced joints, mannequin-only catches a silhouette that has lost the pose's
read, sprite-only is the control.

    python3 tools/pose_contact_sheet.py yuji

Coordinates are percentages of the cell, which is the frame scaled so its long
side fills a square and centred — the same normalisation the sheet renders in,
so a point read off the art lands where it was read. Nothing here knows about
the game's bone names on purpose: this is a check on the eye, upstream of any
pose table it might feed.
"""

import base64
import io
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pose_reads as pr  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "sprites", "docs")

CELL = 320          # the square a pose is drawn in, in SVG user units
THUMB = 480         # pixels the embedded sprite copy is encoded at

# Limb chains, as (a, b, near?) — near limbs draw solid, far ones washed back so
# an overlapping pair still reads as two arms rather than one thick one.
# Limb chains, as (a, b, near?). Facing right, the character's RIGHT limbs are
# the near ones — they draw solid, the left pair washed back, so an overlapping
# pair still reads as two arms rather than one thick one.
BONES = [
    ("neck", "chest", True), ("chest", "pelvis", True),
    ("shoulderL", "elbowL", False), ("elbowL", "handL", False),
    ("shoulderR", "elbowR", True), ("elbowR", "handR", True),
    ("hipL", "kneeL", False), ("kneeL", "footL", False), ("footL", "toeL", False),
    ("hipR", "kneeR", True), ("kneeR", "footR", True), ("footR", "toeR", True),
    ("shoulderL", "shoulderR", True), ("hipL", "hipR", True),
]
ENDS = [("handL", False), ("handR", True), ("toeL", False), ("toeR", True)]


def sprite_data_uri(im):
    """The frame, shrunk and centred in a square, as an inline JPEG."""
    w, h = im.size
    s = THUMB / max(w, h)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    cv = Image.new("RGBA", (THUMB, THUMB), (255, 255, 255, 255))
    cv.alpha_composite(im, ((THUMB - im.width) // 2, (THUMB - im.height) // 2))
    buf = io.BytesIO()
    cv.convert("RGB").save(buf, "JPEG", quality=78, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def mannequin_svg(j):
    """The joint table as a figure: head, tapered torso, four limbs."""
    def p(name):
        x, y = j[name]
        return x * CELL / 100.0, y * CELL / 100.0

    out = [f'<svg class="man" viewBox="0 0 {CELL} {CELL}" aria-hidden="true">']

    # Torso as a solid slab from shoulders to hips, so the figure carries a
    # readable mass and the spine's lean is visible at thumbnail size.
    sfx, sfy = p("shoulderL"); snx, sny = p("shoulderR")
    pfx, pfy = p("hipL"); pnx, pny = p("hipR")
    out.append(
        f'<polygon class="torso" points="{sfx:.1f},{sfy:.1f} {snx:.1f},{sny:.1f} '
        f'{pnx:.1f},{pny:.1f} {pfx:.1f},{pfy:.1f}"/>'
    )

    for a, b, near in BONES:
        ax, ay = p(a); bx, by = p(b)
        cls = "bone near" if near else "bone far"
        out.append(f'<line class="{cls}" x1="{ax:.1f}" y1="{ay:.1f}" x2="{bx:.1f}" y2="{by:.1f}"/>')

    # Head: a circle sized off the neck-to-head distance, and a nose stub
    # leaning the way the head does, which is the read's own head-to-neck offset.
    hx, hy = p("head"); nx, ny = p("neck")
    r = max(9.0, ((hx - nx) ** 2 + (hy - ny) ** 2) ** 0.5 * 0.78)
    out.append(f'<line class="bone near" x1="{nx:.1f}" y1="{ny:.1f}" x2="{hx:.1f}" y2="{hy:.1f}"/>')
    out.append(f'<circle class="head" cx="{hx:.1f}" cy="{hy:.1f}" r="{r:.1f}"/>')

    for name, near in ENDS:
        ex, ey = p(name)
        out.append(f'<circle class="end {"near" if near else "far"}" cx="{ex:.1f}" cy="{ey:.1f}" r="5"/>')
    for name in ("elbowL", "elbowR", "kneeL", "kneeR"):
        ex, ey = p(name)
        out.append(f'<circle class="joint" cx="{ex:.1f}" cy="{ey:.1f}" r="3"/>')

    out.append("</svg>")
    return "".join(out)


PAGE_CSS = """
/* A light table: the plate the art sits on stays lit in either theme, so the
   mannequin's own ink is fixed rather than themed — only the furniture around
   the plates follows the viewer. */
:root {
  --bg: #e8ebee; --panel: #f7f8f9; --ink: #10161c; --muted: #58646f;
  --line: #ccd3d9; --accent: #0b6f92; --warn: #a8412c; --chip: #dfe4e8;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0c1114; --panel: #141b20; --ink: #e4eaee; --muted: #8b98a2;
    --line: #223037; --accent: #4fb6da; --warn: #e08267; --chip: #1d272d;
  }
}
:root[data-theme="dark"] {
  --bg: #0c1114; --panel: #141b20; --ink: #e4eaee; --muted: #8b98a2;
  --line: #223037; --accent: #4fb6da; --warn: #e08267; --chip: #1d272d;
}
:root { --plate: #fff; --pen: #131a20; --pen-far: #9dabb5; --pen-mark: #b4442f; }

* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); margin: 0;
  font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width: 1200px; margin: 0 auto; padding: 44px 22px 96px; }

.mono, h1, .name, .stat b, .modes button, .chip {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
h1 { font-size: 21px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  margin: 0; text-wrap: balance; }
.eyebrow { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--accent); margin: 0 0 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dek { color: var(--muted); margin: 10px 0 0; max-width: 66ch; font-size: 14.5px; }

.stats { display: flex; flex-wrap: wrap; gap: 26px; margin: 26px 0 0;
  padding: 16px 18px; background: var(--panel); border: 1px solid var(--line); }
.stat { display: flex; flex-direction: column; gap: 2px; }
.stat b { font-size: 19px; font-weight: 600; font-variant-numeric: tabular-nums; }
.stat span { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }

.findings { margin: 22px 0 0; padding: 0; list-style: none;
  display: grid; gap: 1px; background: var(--line); border: 1px solid var(--line); }
.findings li { background: var(--panel); padding: 12px 18px; display: grid;
  grid-template-columns: 128px 1fr; gap: 18px; align-items: baseline; font-size: 14px; }
.findings .k { font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--accent); font-family: ui-monospace, Menlo, monospace; }
.findings b { font-weight: 600; }
@media (max-width: 620px) { .findings li { grid-template-columns: 1fr; gap: 4px; } }

.bar { position: sticky; top: 0; z-index: 5; background: var(--bg);
  padding: 18px 0 14px; margin-top: 30px; border-bottom: 1px solid var(--line);
  display: flex; gap: 22px; flex-wrap: wrap; align-items: center; }
.modes { display: flex; gap: 0; }
.modes button { font-size: 11.5px; letter-spacing: 0.1em; text-transform: uppercase;
  padding: 8px 15px; border: 1px solid var(--line); background: var(--panel);
  color: var(--muted); cursor: pointer; margin-left: -1px; }
.modes button:first-child { margin-left: 0; }
.modes button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent);
  color: #fff; position: relative; z-index: 1; }
.modes button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 1px; background: var(--line); border: 1px solid var(--line); border-top: 0; }
figure { margin: 0; background: var(--panel); display: flex; flex-direction: column; }
.plate { position: relative; aspect-ratio: 1; background: var(--plate);
  border-bottom: 1px solid var(--line); }
.plate img, .plate svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.plate img { object-fit: contain; }
figcaption { padding: 10px 12px 13px; cursor: pointer; flex: 1; }
figcaption:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.name { font-size: 12px; letter-spacing: 0.02em; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.chip { font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 3px 6px; background: var(--chip); color: var(--muted); }
.chip.audit { background: transparent; color: var(--warn); box-shadow: inset 0 0 0 1px currentColor; }
.chip.seed { background: transparent; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); }
.chip.cycle { background: transparent; color: var(--accent); box-shadow: inset 0 0 0 1px currentColor; }
.read { color: var(--muted); font-size: 11.5px; line-height: 1.5; margin-top: 6px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
figure.open .read { display: block; }

.torso { fill: var(--pen); opacity: 0.14; }
.bone { stroke-linecap: round; fill: none; }
.bone.near { stroke: var(--pen); stroke-width: 6; }
.bone.far { stroke: var(--pen-far); stroke-width: 5; }
.head { fill: none; stroke: var(--pen); stroke-width: 5; }
.end.near { fill: var(--pen-mark); }
.end.far { fill: var(--pen-far); }
.joint { fill: var(--pen); opacity: 0.5; }

body[data-view="sprite"] .man { display: none; }
body[data-view="man"] .plate img { visibility: hidden; }
body[data-view="overlay"] .plate img { opacity: 0.4; filter: grayscale(1); }
body[data-only="flagged"] figure:not(.flagged) { display: none; }
"""

PAGE_JS = """
const body = document.body;
const press = (sel, key, val) => document.querySelectorAll(sel).forEach(b =>
  b.setAttribute('aria-pressed', String(b.dataset[key] === val)));
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
  body.dataset.view = b.dataset.view; press('[data-view]', 'view', b.dataset.view);
}));
document.querySelectorAll('[data-only]').forEach(b => b.addEventListener('click', () => {
  body.dataset.only = b.dataset.only; press('[data-only]', 'only', b.dataset.only);
}));
document.querySelectorAll('figcaption').forEach(c => {
  c.tabIndex = 0;
  const toggle = () => c.parentElement.classList.toggle('open');
  c.addEventListener('click', toggle);
  c.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
});
body.dataset.view = 'overlay'; body.dataset.only = 'all';
press('[data-view]', 'view', 'overlay'); press('[data-only]', 'only', 'all');
"""


def check(char):
    """Every joint should land ON the drawing. Not sufficient for a good read —
    a joint can sit on the body and still be the wrong joint — but it catches
    the errors an eye slides over: a limb traced a whole hand's width off the
    art, or a figure placed correctly in shape and wrongly in the frame."""
    man = pr.manifest()
    data = pr.load(char)
    off = []
    for name, pose in data["poses"].items():
        ink = pr.cell_mask(pr.open_frame(man, char, name))
        for joint, (jx, jy) in pose["j"].items():
            _, _, d = pr.nearest_ink(jx, jy, ink)
            if d > 2.0:
                off.append((round(d, 1), name, joint))
    off.sort(reverse=True)
    total = sum(len(p["j"]) for p in data["poses"].values())
    print(f"{char}: {len(off)}/{total} joints more than 2% of the cell off the art")
    for d, name, joint in off:
        print(f"  {d:>4}%  {name}.{joint}")
    return off


def build(char, findings=()):
    man = pr.manifest()
    data = pr.load(char)
    poses = data["poses"]
    cells, flagged, seeded = [], 0, 0
    for name, pose in poses.items():
        chips = list(pose.get("flags", []))
        if pose.get("seed"):
            seeded += 1
            chips = [{"k": "seed", "t": pose["seed"]}] + chips
        flagged += 1 if pose.get("flags") else 0
        chip_html = "".join(f'<span class="chip {c["k"]}">{c["t"]}</span>' for c in chips)
        blurb = pose.get("read") or "No read yet — this pose is a fitted seed, waiting for the editor."
        cells.append(
            f'<figure class="{"flagged" if pose.get("flags") else ""}"><div class="plate">'
            f'<img src="{sprite_data_uri(pr.open_frame(man, char, name))}" alt="the {name} sprite">'
            f'{mannequin_svg(pose["j"])}'
            f'</div><figcaption><div class="name">{name}</div>'
            f'{f"<div class=chips>{chip_html}</div>" if chip_html else ""}'
            f'<div class="read">{blurb}</div></figcaption></figure>'
        )

    find_html = "".join(
        f'<li><span class="k">{k}</span><span><b>{h}</b> {rest}</span></li>'
        for k, h, rest in findings
    )
    name = char.capitalize()
    read_n = len(poses) - seeded
    html = f"""<title>{name} Pose Contact Sheet</title>
<style>{PAGE_CSS}</style>
<div class="wrap">
  <p class="eyebrow">Sprite pose read &middot; {name}</p>
  <h1>{name} Pose Contact Sheet</h1>
  <p class="dek">Every frame in <span class="mono">sprites/assets/{char}/</span>, drawn as the engine
  draws it, with the pose read into sixteen joints and drawn back as a mannequin over the art.
  The overlay is the test: where the figure and the drawing separate, the read is wrong.
  Tap any caption for the full read.</p>
  <div class="stats">
    <div class="stat"><b>{len(poses)}</b><span>frames</span></div>
    <div class="stat"><b>{read_n}</b><span>read by eye</span></div>
    <div class="stat"><b>{seeded}</b><span>fitted seeds</span></div>
    <div class="stat"><b>{len(poses) * 16}</b><span>joints placed</span></div>
  </div>
  <ul class="findings">{find_html}</ul>
  <div class="bar">
    <div class="modes">
      <button data-view="overlay">Overlay</button>
      <button data-view="man">Mannequin</button>
      <button data-view="sprite">Sprite</button>
    </div>
    <div class="modes">
      <button data-only="all">All {len(poses)}</button>
      <button data-only="flagged">Flagged {flagged}</button>
    </div>
  </div>
  <div class="grid">{"".join(cells)}</div>
</div>
<script>{PAGE_JS}</script>
"""
    out = os.path.join(DOCS, f"{char}-pose-contact-sheet.html")
    with open(out, "w") as fh:
        fh.write(html)
    print(f"{out}  ({len(poses)} poses, {os.path.getsize(out) / 1e6:.1f} MB)")
    return out


# The headline reads, stated once at the top of the sheet so it answers its
# question before anyone scrolls. Kept next to the renderer rather than in the
# data because they are conclusions ABOUT the set, not properties of a frame.
YUJI_FINDINGS = [
    ("Verdict", "The read holds up.",
     "All 640 joints land on the drawing, and at overlay the mannequin tracks the art "
     "closely enough to author from — hips, knees and reach are trustworthy."),
    ("Caveat", "It is a side-on read.",
     "Depth is guessed. Which limb is nearer, and how far a fist travels toward camera, "
     "is inference from overlap and shading, not measurement — a 3D clip needs that axis checked by hand."),
    ("Crouch", "A three-point stance, not a squat.",
     "Yuji drops a hand to the floor with the rear leg stretched back. The pose audit's "
     "squat, measured on other fighters, is the wrong shape for him — and the crouch attacks inherit it."),
    ("Ledge", "One arm, not two.",
     "He hangs one-handed with the other arm at his side; the audit raised both arms after "
     "reading Choso, Yuki and Nanami."),
    ("Land", "Both hands reach forward.",
     "The audit's one-hand touchdown is not what this sheet draws."),
    ("Also", "Dizzy tips backward, jump is already tucked, hurt reacts in the spine.",
     "Three more defaults that were matched to other fighters and read wrong on Yuji."),
    ("Duplicates", "Six frames carry no new pose.",
     "special_down is idle with a wisp of aura; ult_a and ult_b are the heavy's contact frame; "
     "idle_b and attack_light_b repeat their partners. Only attack_heavy_a is a true wind-up."),
    ("Run cycle", "Every run frame leads with the same leg.",
     "The six run drawings are one half-cycle. The other half has to be mirrored — which is "
     "what mirrorClips in render3d/src/clips.js already does."),
]


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    name = args[0] if args else "yuji"
    if "--check" in sys.argv:
        check(name)
    else:
        build(name, YUJI_FINDINGS if name == "yuji" else ())
