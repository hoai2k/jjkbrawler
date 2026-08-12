// The 3D workbench's POSE EDITOR: drag a joint, get an animation back.
//
// It edits POSES, not frames of animation. A state is a handful of extremes —
// the contact of a run, the full extension of a strike, the deepest point of a
// landing — and everything between them is a curve (render3d/src/clips.js).
// So the editor gives you the extremes and nothing else: pick one, pose the
// body, pick how it travels out, and the in-betweens rebuild themselves.
// Nothing here can produce the thing hand-authored in-betweens always decay
// into, which is one extreme moved and eleven left behind.
//
// AND THE EXTREMES ARE THE DRAWINGS. Which poses a state has is not a question
// this tool asks the animator: the fighter's sprite set already answers it —
// `idle_a` and `idle_b`, four run frames, a wind-up and a strike — and at a
// frame rate the clip durations were derived from (sprite_poses.js). So the
// table is built by reading the delivered clip AT THOSE INSTANTS, each key
// carries the name of the drawing it has to match, and the animation is the
// interpolation between them. That is what makes "does this look right?" a
// question with an answer on screen: the drawing is next to it.
//
// TWO SPACES, AND WHY THE UI INSISTS ON SAYING WHICH
//
// Some bones are not the clip's to pose. In an attack, ik.js solves the
// striking arm onto the aim point; the spine pitches toward it; on the ground
// the feet are clamped to the floor. Authoring a keyframe on one of those is
// authoring into a value that gets overwritten a millisecond later — the tool
// would appear to work and change nothing.
//
// So every bone is classified per state (pose.js `boneOwners`) and edited in
// the space that survives:
//
//   CHARACTER SPACE — the clip owns this bone. The edit is the keyframe.
//   TARGET SPACE    — a solver owns it. The edit is an offset applied AFTER
//                     the solve, and it therefore means "this much more than
//                     the solve gives, whatever the target is" — which is the
//                     only form of the note that stays true at every angle the
//                     strike can be thrown at.
//
// The panel names the space for the selected joint, and the handles are
// coloured by it, because an edit that means two different things depending on
// a rule you cannot see is worse than no edit at all.
//
// HEIGHT. Editing an idle re-measures the fighter (loader.js calibrateHeight):
// how tall the model stands in its idle IS how big it is drawn, in every
// state. The panel shows the number and says so.

import { buildClipFromKeys, clipToKeys, posesAt, sampleDeltaTrack, EASE_NAMES } from "../../render3d/src/clips.js";

const DEG = Math.PI / 180;
/** Handle hit radius, in game pixels before the viewer's zoom. */
const HIT_PX = 14;

const SPACE_HELP = {
  character: "character space — the clip owns this bone, so your edit IS the keyframe.",
  target: "TARGET space — a solver aims this bone at the aim point in this state, "
    + "so the edit is saved as an offset from the solve and holds at every angle.",
  ground: "character space, floor-clamped — the clip owns this bone, but foot IK "
    + "will lift it if the pose sinks it through the floor.",
  prop: "TARGET space — the two-handed grip puts this hand on the shaft, "
    + "so the edit is saved as an offset from that solve.",
};
const SPACE_LABEL = { character: "character-oriented", target: "target-oriented",
                      ground: "character-oriented (floor-clamped)", prop: "prop-oriented" };
/** The spaces whose edits cannot live in a keyframe (a solver would erase it). */
const POST_SPACES = new Set(["target", "prop"]);

export function makePoseEditor(opts) {
  const {
    THREE, canvas, camera, getRig, charKey, stateKey, stateSpec,
    resolveClip,        // (char, state) -> { clip, source } — the UNedited clip
    boneOwners,         // (state, char) -> Map bone -> owner
    project, mirror, posePreview, onChange, onEditModeChange, onHeightChange, status,
  } = opts;

  const $ = (id) => document.getElementById(id);
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const qp = new THREE.Quaternion();
  const qk = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const vA = new THREE.Vector3();
  const vAxis = new THREE.Vector3();

  /** char -> state -> { keys, deltas, clip, dirty } */
  const tables = {};
  const ed = {
    on: false,
    joint: null,
    ki: 0,              // selected keyframe index
    dragging: null,
    lastAngle: 0,
  };

  // ------------------------------------------------------------ the table

  /**
   * The keyframe table for one state, built on first touch.
   *
   * ITS KEYS ARE THE SPRITE POSES. A state's drawings and their frame rate say
   * when each pose is on screen (sprite_poses.js), and the delivered clip is
   * READ at exactly those instants — so key three of a run is the pose that
   * belongs to the third drawing of the run, and the animation between them is
   * the interpolation. Editing key three edits that drawing's pose everywhere
   * it is used, which is the whole point of posing against the art.
   *
   * A state whose art does not resolve (no frames delivered) falls back to the
   * clip's own extremes, so nothing becomes uneditable for want of a drawing.
   */
  function tableFor(char = charKey(), st = stateKey(), make = true) {
    const held = tables[char]?.[st];
    if (held || !make) return held || null;
    const resolved = resolveClip(char, st);
    if (!resolved) return null;
    const sched = (opts.poseSchedule?.(char, st) || [])
      // Two frames can land on the same instant when a fallback pose set plays
      // at the wrong rate; one instant is one key.
      .filter((s, i, all) => all.findIndex((o) => Math.abs(o.t - s.t) < 1e-4) === i);
    let keys;
    if (sched.length) {
      keys = posesAt(THREE, resolved.clip, sched.map((s) => s.t));
      keys.forEach((k, i) => { k.frame = sched[i].frame; k.ease = sched[i].ease; });
    } else {
      keys = clipToKeys(THREE, resolved.clip);
    }
    if (!keys.length) return null;
    tables[char] = tables[char] || {};
    tables[char][st] = { keys, deltas: {}, clip: null, dirty: false, source: resolved.source,
                         fromPoses: !!sched.length };
    return tables[char][st];
  }

  /** Has this drawing been posed by hand yet, in any state that draws it? The
   *  pose bench walks 36 of them per fighter, and "which have I done" is the
   *  one thing a list of 36 has to be able to say. */
  function poseEdited(char, frame) {
    for (const t of Object.values(tables[char] || {})) {
      if (t.keys.some((k) => k.frame === frame && k.editedBones?.size)) return true;
    }
    return false;
  }

  /** Select the key that IS this sprite frame. -1 when the state does not draw
   *  it, which the caller reads as "nothing to select". */
  function indexOfFrame(frame, char = charKey(), st = stateKey()) {
    const t = tableFor(char, st);
    return t ? t.keys.findIndex((k) => k.frame === frame) : -1;
  }

  function key() {
    const t = tableFor();
    if (!t) return null;
    ed.ki = Math.max(0, Math.min(ed.ki, t.keys.length - 1));
    return t.keys[ed.ki];
  }

  /**
   * Play the interpolation between the sprite poses INSTEAD of the delivered
   * clip, edits or no edits — the A/B for the whole strategy. Off, a delivered
   * animation plays exactly as it always did.
   */
  let interpolate = false;
  function setInterpolate(on) {
    if (interpolate === on) return;
    interpolate = on;
    for (const states of Object.values(tables)) {
      for (const t of Object.values(states)) t.clip = null;
    }
    onChange();
    syncPanel();
  }

  /** The clip to play: rebuilt from the table once anything is edited — or
   *  always, when the pose interpolation is being auditioned. */
  function editedClip(char, st) {
    const t = interpolate ? tableFor(char, st) : tables[char]?.[st];
    if (!t || !(t.dirty || (interpolate && t.fromPoses))) return null;
    if (!t.clip) {
      const spec = stateSpec(st);
      t.clip = buildClipFromKeys(THREE, st, t.keys,
        { duration: spec?.duration, beat: spec?.beat, loop: !!spec?.loop });
    }
    return t.clip;
  }

  function touched(t) {
    t.dirty = true;
    t.clip = null;
    onChange();
    // An idle that changes shape changes how tall the fighter is drawn.
    if (stateKey() === "idle") onHeightChange?.();
    syncPanel();
  }

  // -------------------------------------------------------------- spaces

  function owners() {
    return boneOwners(stateKey(), charKey());
  }
  function spaceOf(bone, map = owners()) {
    return map.get(bone) || "character";
  }
  const isPost = (bone, map) => POST_SPACES.has(spaceOf(bone, map));

  // ------------------------------------------------------ reading an edit

  /** The stored value for `bone` at the selected key, in degrees. */
  function get(bone) {
    const t = tableFor();
    if (!t || !bone) return [0, 0, 0];
    if (isPost(bone)) {
      const entry = (t.deltas[bone] || []).find((d) => Math.abs(d.t - (key()?.t ?? 0)) < 1e-6);
      return entry ? [...entry.deg] : [0, 0, 0];
    }
    return [...(key()?.pose?.[bone] || [0, 0, 0])];
  }

  function set(bone, deg) {
    const t = tableFor();
    const k = key();
    if (!t || !k || !bone) return;
    const rounded = deg.map((v) => Math.round(v * 100) / 100);
    if (isPost(bone)) {
      const track = t.deltas[bone] || (t.deltas[bone] = []);
      (k.editedBones || (k.editedBones = new Set())).add(bone);
      const at = track.find((d) => Math.abs(d.t - k.t) < 1e-6);
      if (at) at.deg = rounded;
      else track.push({ t: k.t, deg: rounded, ease: k.ease || "ease" });
      track.sort((a, b) => a.t - b.t);
      if (!rounded.some(Boolean) && track.length === 1) delete t.deltas[bone];
      // Post-space edits never change the clip, so the rebuild is skipped, but
      // the cache key and the panel still have to move.
      t.dirty = true;
      onChange();
      syncPanel();
      return;
    }
    k.pose[bone] = rounded;
    // Which bones were MOVED, as opposed to which the clip already had a value
    // for — which is all of them. Without this every handle lit up gold the
    // moment anything in the state was touched, and "what have I actually
    // changed on this pose?" had no answer on screen.
    (k.editedBones || (k.editedBones = new Set())).add(bone);
    touched(t);
  }

  /** The post-solve offsets for the frame at `clipT`, for pose.js. */
  function postEdits(clipT) {
    const t = tableFor(charKey(), stateKey(), false);
    if (!t) return null;
    const out = [];
    for (const [bone, track] of Object.entries(t.deltas)) {
      const deg = sampleDeltaTrack(track, clipT);
      if (deg && deg.some((v) => Math.abs(v) > 1e-4)) {
        out.push([bone, deg[0] * DEG, deg[1] * DEG, deg[2] * DEG]);
      }
    }
    return out.length ? out : null;
  }

  /** Same edits, same pixels: the pose cache's share of the table. */
  function editKey() {
    // Built here when the interpolation is on, because `editedClip` below is
    // about to build it anyway: a key read before the table exists is the key
    // the interpolated frame would get CACHED under.
    const t = tableFor(charKey(), stateKey(), interpolate);
    // The interpolation is a different set of pixels from the delivered clip,
    // so it is a different cache key — without this the A/B shows whichever
    // one was rendered first.
    if (!t || !(t.dirty || interpolate)) return "";
    if (!t.dirty) return interpolate ? "poses" : "";
    const poses = t.keys.map((k, i) => `${i}:${k.ease}:${Object.entries(k.pose)
      .map(([b, d]) => `${b}${d.join(",")}`).join(";")}`).join("|");
    const deltas = Object.entries(t.deltas)
      .map(([b, tr]) => `${b}=${tr.map((d) => `${d.t}:${d.deg.join(",")}`).join(";")}`).join("|");
    return `${hash(poses)}/${hash(deltas)}`;
  }
  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h.toString(36);
  }

  function editCount() {
    let n = 0;
    for (const states of Object.values(tables)) {
      for (const t of Object.values(states)) {
        if (t.dirty) n += Object.keys(t.deltas).length + 1;
      }
    }
    return n;
  }

  // --------------------------------------------------------------- bones

  function boneList() {
    const rig = getRig();
    const out = [];
    if (rig) rig.root.traverse((o) => { if (o.isBone) out.push(o); });
    return out;
  }

  function dragPair(bone) {
    if (bone.parent?.isBone) return { rotate: bone.parent, pivot: bone.parent, mode: "limb" };
    return { rotate: bone, pivot: bone, mode: "root" };
  }

  // --------------------------------------------------------------- panel

  const jointSel = $("jointSelect");
  const axisRows = $("axisRows");
  const keyStrip = $("keyStrip");
  const easeSel = $("easeSelect");
  const axisEls = [];
  for (const [i, name] of ["X", "Y", "Z"].entries()) {
    const row = document.createElement("div");
    row.className = "axis";
    const label = document.createElement("span");
    label.textContent = name;
    const range = document.createElement("input");
    range.type = "range"; range.min = "-180"; range.max = "180"; range.step = "0.5"; range.value = "0";
    const num = document.createElement("input");
    num.type = "number"; num.step = "0.5"; num.value = "0";
    const push = (v) => {
      if (!ed.joint) return;
      const d = get(ed.joint);
      d[i] = v;
      set(ed.joint, d);
    };
    range.oninput = () => push(parseFloat(range.value));
    num.onchange = () => push(parseFloat(num.value) || 0);
    row.append(label, range, num);
    axisRows.append(row);
    axisEls.push({ range, num });
  }

  for (const name of EASE_NAMES) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = {
      hold: "hold — nothing moves until the next key",
      linear: "linear — constant speed",
      ease: "ease — slow out, slow in",
      in: "in — accelerate away (anticipation)",
      out: "out — decelerate in (settle)",
      snap: "snap — most of the travel at once (strikes)",
      back: "back — overshoot and return (recoil)",
    }[name] || name;
    easeSel.append(o);
  }
  easeSel.onchange = () => {
    const k = key();
    const t = tableFor();
    if (!k || !t) return;
    k.ease = easeSel.value;
    touched(t);
  };

  function fillJoints() {
    const bones = boneList();
    jointSel.innerHTML = "";
    for (const b of bones) {
      const o = document.createElement("option");
      o.value = b.name;
      o.textContent = b.name;
      jointSel.append(o);
    }
    if (!bones.some((b) => b.name === ed.joint)) ed.joint = bones[0]?.name || null;
    syncPanel();
  }

  /** Select a keyframe — and put the playhead ON it, because an edit made at a
   *  time between keys would be an edit you could not see land. */
  function selectKey(i) {
    const t = tableFor();
    if (!t) return;
    ed.ki = Math.max(0, Math.min(i, t.keys.length - 1));
    opts.setTime(t.keys[ed.ki].t);
    syncPanel();
  }

  function syncPanel() {
    const t = tableFor();
    const map = owners();
    if (ed.joint) jointSel.value = ed.joint;

    // The keyframe strip: every extreme in this state, the beat marked, the
    // edited ones marked, the selected one lit.
    keyStrip.innerHTML = "";
    const beat = stateSpec(stateKey())?.beat;
    (t?.keys || []).forEach((k, i) => {
      const b = document.createElement("button");
      b.className = "keychip" + (i === ed.ki ? " sel" : "")
        + (beat !== undefined && Math.abs(k.t - beat) < 1e-6 ? " beat" : "");
      // Named by the DRAWING when there is one: "attack_light_b" says what the
      // pose has to look like in a way "0.08s" never can.
      b.textContent = k.frame || `${k.t.toFixed(2)}s`;
      b.title = beat !== undefined && Math.abs(k.t - beat) < 1e-6
        ? `the contact beat — full extension belongs here (${k.t.toFixed(2)}s)`
        : `${k.frame ? `${k.frame} — ` : ""}${k.t.toFixed(2)}s`;
      b.onclick = () => selectKey(i);
      keyStrip.append(b);
    });

    const k = key();
    if (k) easeSel.value = k.ease || "linear";

    // What space the selected joint is edited in, and why.
    const space = ed.joint ? spaceOf(ed.joint, map) : "character";
    const badge = $("spaceBadge");
    badge.textContent = SPACE_LABEL[space];
    badge.className = `badge ${POST_SPACES.has(space) ? "target" : "character"}`;
    $("spaceHelp").textContent = SPACE_HELP[space];

    for (const o of jointSel.options) {
      const s = spaceOf(o.value, map);
      const has = POST_SPACES.has(s)
        ? !!t?.deltas[o.value]
        : !!k?.editedBones?.has(o.value);
      o.textContent = `${has ? "● " : ""}${o.value}${POST_SPACES.has(s) ? " ⌖" : ""}`;
    }

    const d = ed.joint ? get(ed.joint) : [0, 0, 0];
    axisEls.forEach((a, i) => { a.range.value = String(d[i]); a.num.value = String(d[i]); });

    const n = editCount();
    $("poseLine").textContent = t
      ? `${stateKey()}: ${t.keys.length} ${t.fromPoses ? "sprite pose(s)" : "keyframes"}`
        + ` from ${t.source}${t.dirty ? " — EDITED" : ""}`
      : "no clip resolves for this state";
    $("poseCount").textContent = n ? `${n} edited block(s) this session` : "";
  }

  function setEditMode(on) {
    ed.on = on;
    $("editPoseBtn").classList.toggle("on", on);
    $("editPoseBtn").textContent = on ? "✥ Editing pose" : "✥ Edit pose";
    $("poseBox").classList.toggle("editing", on);
    if (on) { tableFor(); selectKey(ed.ki); }
    onEditModeChange?.(on);
    syncPanel();
  }

  /** Insert an extreme at `t`, holding whatever the clip already does there —
   *  so adding a key changes nothing until it is posed, which is the only way
   *  an extra extreme is safe to add mid-edit. */
  function addKeyAt(t) {
    const table = tableFor();
    if (!table) return;
    if (table.keys.some((k) => Math.abs(k.t - t) < 1e-4)) {
      selectKey(table.keys.findIndex((k) => Math.abs(k.t - t) < 1e-4));
      return;
    }
    const base = resolveClip(charKey(), stateKey())?.clip;
    const sampled = base ? clipToKeys(THREE, buildClipFromKeys(THREE, "probe", table.keys,
      { duration: stateSpec(stateKey())?.duration })) : null;
    // Sample the CURRENT table at t by rebuilding it and reading the value
    // back — the same path the viewer draws, so the new key lands exactly on
    // the curve it is being inserted into.
    const probe = sampled ? nearestPose(sampled, t) : {};
    const prev = [...table.keys].reverse().find((k) => k.t < t);
    table.keys.push({ t, pose: { ...probe }, ease: prev?.ease || "ease" });
    table.keys.sort((a, b) => a.t - b.t);
    ed.ki = table.keys.findIndex((k) => Math.abs(k.t - t) < 1e-9);
    touched(table);
    selectKey(ed.ki);
  }

  function nearestPose(keys, t) {
    let best = keys[0];
    for (const k of keys) if (Math.abs(k.t - t) < Math.abs(best.t - t)) best = k;
    return best?.pose || {};
  }

  $("keyAdd").onclick = () => addKeyAt(+opts.clipTime().toFixed(4));
  $("keyBeat").onclick = () => {
    const beat = stateSpec(stateKey())?.beat;
    if (beat === undefined) { status("this state has no contact beat — only attacks do"); return; }
    addKeyAt(beat);
  };
  $("keyDel").onclick = () => {
    const table = tableFor();
    if (!table || table.keys.length <= 2) { status("a clip needs at least two extremes"); return; }
    const gone = table.keys.splice(ed.ki, 1)[0];
    for (const track of Object.values(table.deltas)) {
      const i = track.findIndex((d) => Math.abs(d.t - gone.t) < 1e-6);
      if (i >= 0) track.splice(i, 1);
    }
    ed.ki = Math.max(0, ed.ki - 1);
    touched(table);
    selectKey(ed.ki);
  };

  $("editPoseBtn").onclick = () => setEditMode(!ed.on);
  jointSel.onchange = () => { ed.joint = jointSel.value; syncPanel(); };
  $("keyPrev").onclick = () => selectKey(ed.ki - 1);
  $("keyNext").onclick = () => selectKey(ed.ki + 1);
  $("resetJointBtn").onclick = () => {
    const t = tableFor();
    if (!t || !ed.joint) return;
    if (isPost(ed.joint)) delete t.deltas[ed.joint];
    else {
      const fresh = clipToKeys(THREE, resolveClip(charKey(), stateKey())?.clip);
      const src = fresh[ed.ki]?.pose?.[ed.joint];
      if (src) key().pose[ed.joint] = [...src];
      else delete key().pose[ed.joint];
    }
    touched(t);
  };
  $("resetStateBtn").onclick = () => {
    const c = charKey();
    if (tables[c]) delete tables[c][stateKey()];
    tableFor();
    onChange();
    if (stateKey() === "idle") onHeightChange?.();
    syncPanel();
  };
  $("resetAllBtn").onclick = () => {
    for (const k of Object.keys(tables)) delete tables[k];
    tableFor();
    onChange();
    onHeightChange?.();
    syncPanel();
  };

  // --------------------------------------------------------------- export

  $("poseExportBtn").onclick = () => {
    const characters = {};
    for (const [char, states] of Object.entries(tables)) {
      for (const [st, t] of Object.entries(states)) {
        if (!t.dirty) continue;
        const c = characters[char] = characters[char] || { poses: {}, states: {} };
        const spec = stateSpec(st) || {};
        // THE POSE LIBRARY: one entry per DRAWING, not per state. A pose shared
        // by two states is one pose, and exporting it twice is how the two
        // copies start to disagree.
        for (const k of t.keys) {
          if (k.frame) c.poses[k.frame] = k.pose;
        }
        c.states[st] = {
          from: t.source,
          duration: spec.duration,
          beat: spec.beat,
          loop: !!spec.loop,
          keys: t.keys.map((k) => ({
            ...(k.frame ? { frame: k.frame } : {}),
            t: +k.t.toFixed(4),
            ease: k.ease || "linear",
            // Named poses live in the library above; only an unnamed key (a
            // state with no delivered art) carries its own table.
            ...(k.frame ? {} : { pose: k.pose }),
          })),
          ...(Object.keys(t.deltas).length ? { targetSpaceOffsetsDeg: t.deltas } : {}),
        };
      }
    }
    const payload = {
      kind: "render3d-pose-library",
      exported: new Date().toISOString(),
      note: "POSES are keyed by SPRITE FRAME — the drawing the model is matched "
        + "to — in DEGREES (local XYZ euler per bone). STATES say which poses a "
        + "state plays, when, and how the body travels out of each (`ease`, baked "
        + "by render3d/src/clips.js): the animation is the interpolation between "
        + "the poses, so a state carries no pose data of its own. Times come from "
        + "the sprite animation's own fps, which render3d/src/states.js already "
        + "derives its durations from. `targetSpaceOffsetsDeg` are NOT poses: "
        + "those bones are solved onto the aim point at pose time (ik.js), and the "
        + "offsets are applied after the solve.",
      characters,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pose-library.json";
    a.click();
    const poses = Object.values(characters).reduce((n, c) => n + Object.keys(c.poses).length, 0);
    status(Object.keys(characters).length
      ? `exported ${poses} pose(s) across ${Object.keys(characters).length} character(s) — hand pose-library.json back`
      : "exported an empty payload — no poses have been moved");
  };

  // -------------------------------------------------------------- viewer

  function handles() {
    const out = [];
    const map = owners();
    for (const b of boneList()) {
      b.getWorldPosition(vA);
      const p = project(vA);
      if (!p || p.behind) continue;
      out.push({ bone: b, x: p.x, y: p.y, space: spaceOf(b.name, map) });
    }
    return out;
  }

  function draw(ctx, zoom) {
    if (!ed.on) return;
    const t = tableFor(charKey(), stateKey(), false);
    const k = key();
    const r = Math.max(3, 5 / zoom);
    ctx.save();
    ctx.lineWidth = 1.5 / zoom;
    for (const h of handles()) {
      const sel = h.bone.name === ed.joint;
      const post = POST_SPACES.has(h.space);
      const edited = post ? !!t?.deltas[h.bone.name] : !!k?.editedBones?.has(h.bone.name);
      if (h.bone.parent?.isBone) {
        h.bone.parent.getWorldPosition(vA);
        const p = project(vA);
        if (p && !p.behind) {
          ctx.strokeStyle = "rgba(120, 140, 190, 0.5)";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(h.x, h.y);
          ctx.stroke();
        }
      }
      ctx.beginPath();
      // Target-owned joints are drawn as diamonds, character-owned as discs:
      // the space an edit lands in is visible before it is made.
      if (post) {
        const s = (sel ? r * 1.9 : r * 1.3);
        ctx.moveTo(h.x, h.y - s); ctx.lineTo(h.x + s, h.y);
        ctx.lineTo(h.x, h.y + s); ctx.lineTo(h.x - s, h.y);
        ctx.closePath();
      } else {
        ctx.arc(h.x, h.y, sel ? r * 1.7 : r, 0, Math.PI * 2);
      }
      ctx.fillStyle = sel ? "rgba(159, 211, 159, 0.95)"
        : edited ? "rgba(211, 198, 159, 0.95)"
        : post ? "rgba(203, 160, 210, 0.8)" : "rgba(150, 170, 220, 0.75)";
      ctx.fill();
      ctx.strokeStyle = "rgba(11, 14, 23, 0.9)";
      ctx.stroke();
      if (sel) {
        ctx.fillStyle = "#9fd39f";
        ctx.font = `${Math.max(9, 12 / zoom)}px ui-monospace, monospace`;
        ctx.fillText(h.bone.name, h.x + r * 2, h.y - r * 2);
      }
    }
    ctx.restore();
  }

  const angleAbout = (pivot, pt) => Math.atan2(pt.y - pivot.y, pt.x - pivot.x);

  function pointerDown(pt, zoom) {
    if (!ed.on) return false;
    let best = null, bestD = HIT_PX / zoom;
    for (const h of handles()) {
      const d = Math.hypot(h.x - pt.x, h.y - pt.y);
      if (d < bestD) { bestD = d; best = h; }
    }
    if (!best) return false;
    ed.joint = best.bone.name;
    const pair = dragPair(best.bone);
    pair.pivot.getWorldPosition(vA);
    const pv = project(vA);
    ed.dragging = { bone: best.bone, ...pair };
    ed.lastAngle = pv ? angleAbout(pv, pt) : 0;
    syncPanel();
    return true;
  }

  function pointerMove(pt) {
    const drag = ed.dragging;
    if (!drag) return false;
    posePreview();
    drag.pivot.getWorldPosition(vA);
    const pv = project(vA);
    if (!pv) return true;

    let delta;
    if (drag.mode === "limb") {
      drag.bone.getWorldPosition(vA);
      const hp = project(vA);
      if (!hp) return true;
      delta = angleAbout(pv, pt) - angleAbout(pv, hp);
    } else {
      const a = angleAbout(pv, pt);
      delta = a - ed.lastAngle;
      ed.lastAngle = a;
    }
    if (!delta) return true;
    delta = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const signed = -delta * (mirror() < 0 ? -1 : 1);

    camera().getWorldDirection(vAxis);
    vAxis.negate().normalize();
    q1.setFromAxisAngle(vAxis, signed);
    drag.rotate.parent.getWorldQuaternion(qp);
    q2.copy(qp).invert().multiply(q1).multiply(qp);

    // Compose into whichever number this bone's edits live in.
    const name = drag.rotate.name;
    const cur = get(name);
    eul.set(cur[0] * DEG, cur[1] * DEG, cur[2] * DEG, "XYZ");
    qk.setFromEuler(eul).premultiply(q2);
    eul.setFromQuaternion(qk, "XYZ");
    ed.joint = name;
    set(name, [eul.x / DEG, eul.y / DEG, eul.z / DEG]);
    return true;
  }

  function pointerUp() { ed.dragging = null; }

  canvas.addEventListener("dblclick", () => { if (ed.on) setEditMode(false); });

  fillJoints();
  setEditMode(false);

  if (typeof window !== "undefined") {
    window.__poseEditor = { handles, tables, state: ed, editedClip, postEdits, selectKey };
  }

  return {
    get on() { return ed.on; },
    get joint() { return ed.joint; },
    editedClip, postEdits, editKey, draw, pointerDown, pointerMove, pointerUp,
    fillJoints, syncPanel, setEditMode, tableFor, selectKey, indexOfFrame, poseEdited,
    setInterpolate,
    get keyIndex() { return ed.ki; },
  };
}
