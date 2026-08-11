// The 3D workbench's POSE EDITOR: drag a joint in the viewer, get numbers back.
//
// The problem it exists for: the clip library is authored blind. A state's
// default clip is a guess at the read of its sprite, and the only way anyone
// could say "the arm is too low" was in prose. This turns that into an edit —
// grab the hand, swing it where the sprite has it, and press Output changes.
// The JSON that falls out names bones and degrees, which is exactly the shape
// of the pose tables the clips are built from (billboards/src/mannequin.js
// POSES), so a note back can be applied rather than interpreted.
//
// WHAT AN EDIT IS. One rotation offset per (character, state, bone), in the
// bone's parent frame, applied on top of the clip for the WHOLE state — not
// keyed per frame. That is deliberate: a per-frame edit would need a keyframe
// editor and a blend policy, while "this shoulder sits 20° too low all the way
// through this attack" is the note actually worth sending. The offset rides
// pose.js's edit layer, ahead of aim/reach/IK, so the edited body is what
// every live layer then solves against.
//
// DRAGGING is FK, phrased the way a hand expects: dragging a joint rotates its
// PARENT bone so the joint swings toward the pointer. The rotation happens
// about the camera's view axis, so what the drag does on screen is what the
// pointer did on screen, under a ¾ camera that would otherwise make every drag
// a guess about depth.

const DEG = Math.PI / 180;
/** Handle hit radius, in game pixels before the viewer's zoom. */
const HIT_PX = 14;

export function makePoseEditor(opts) {
  const {
    THREE, canvas, camera, getRig, charKey, stateKey,
    project,            // (worldVec3) -> {x, y, behind} in game-pixel space
    mirror,             // () -> +1, or -1 when the blit mirrors the render
    posePreview,        // () -> pose the rig now, so world matrices are current
    onChange,           // () -> invalidate the render cache / repaint
    onEditModeChange,   // (on) -> the workbench pauses playback
    status,             // (text) -> the status line
  } = opts;

  const $ = (id) => document.getElementById(id);
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const qp = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const vA = new THREE.Vector3();
  const vAxis = new THREE.Vector3();

  /** char -> state -> bone -> [rx, ry, rz] degrees, parent frame. */
  const edits = {};
  const ed = {
    on: false,
    joint: null,        // selected bone NAME, shared by the viewer and the panel
    dragging: null,     // { handle, rotate, mode }
    lastAngle: 0,
  };

  // ------------------------------------------------------------- the store

  function bucket(make = false) {
    const c = charKey(), s = stateKey();
    if (!make) return edits[c]?.[s] || null;
    edits[c] = edits[c] || {};
    edits[c][s] = edits[c][s] || {};
    return edits[c][s];
  }

  function get(bone) {
    const b = bucket();
    return (b && b[bone]) || [0, 0, 0];
  }

  function set(bone, deg) {
    const b = bucket(true);
    if (!deg[0] && !deg[1] && !deg[2]) delete b[bone];
    else b[bone] = deg.map((v) => Math.round(v * 100) / 100);
    onChange();
    syncPanel();
  }

  /** The layer pose.js consumes: [[bone, rx, ry, rz], ...] in radians. */
  function layerEdits() {
    const b = bucket();
    if (!b) return null;
    const out = [];
    for (const [bone, d] of Object.entries(b)) out.push([bone, d[0] * DEG, d[1] * DEG, d[2] * DEG]);
    return out.length ? out : null;
  }

  /** A compact key for the pose cache — same edits, same pixels. */
  function editKey() {
    const b = bucket();
    if (!b) return "";
    const parts = Object.keys(b).sort().map((k) => `${k}:${b[k].join(",")}`);
    return parts.join("|") || "";
  }

  function editCount() {
    let n = 0;
    for (const states of Object.values(edits)) {
      for (const bones of Object.values(states)) n += Object.keys(bones).length;
    }
    return n;
  }

  // -------------------------------------------------------------- the bones
  //
  // Whatever the rig actually has, in skeleton order — a delivery may carry
  // fingers or a cape the mannequin never had, and the editor should reach
  // them without a list to maintain.

  function boneList() {
    const rig = getRig();
    const out = [];
    if (!rig) return out;
    rig.root.traverse((o) => { if (o.isBone) out.push(o); });
    return out;
  }

  function boneNamed(name) {
    const rig = getRig();
    return name && rig ? rig.root.getObjectByName(name) : null;
  }

  /** Which bone a handle turns, and about what. Dragging a joint rotates its
   *  parent (the limb swings). A root bone has no parent to turn, so it turns
   *  itself, and the drag is read as incremental pointer swing about it. */
  function dragPair(bone) {
    if (bone.parent?.isBone) return { rotate: bone.parent, pivot: bone.parent, mode: "limb" };
    return { rotate: bone, pivot: bone, mode: "root" };
  }

  // --------------------------------------------------------------- the panel

  const jointSel = $("jointSelect");
  const axisRows = $("axisRows");
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
      const d = [...get(ed.joint)];
      d[i] = v;
      set(ed.joint, d);
    };
    range.oninput = () => push(parseFloat(range.value));
    num.onchange = () => push(parseFloat(num.value) || 0);
    row.append(label, range, num);
    axisRows.append(row);
    axisEls.push({ range, num });
  }

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

  function syncPanel() {
    const b = bucket() || {};
    if (ed.joint) jointSel.value = ed.joint;
    // Edited joints are marked in the list, so a set of edits is readable
    // without clicking through every bone.
    for (const o of jointSel.options) {
      const has = !!b[o.value];
      o.textContent = has ? `● ${o.value}` : o.value;
      o.className = has ? "edited" : "";
    }
    const d = ed.joint ? get(ed.joint) : [0, 0, 0];
    axisEls.forEach((a, i) => { a.range.value = String(d[i]); a.num.value = String(d[i]); });
    const here = Object.keys(b).length;
    const all = editCount();
    $("poseLine").textContent = all
      ? `${here} joint(s) edited on ${charKey()}/${stateKey()} · ${all} across the session`
      : "no pose edits";
  }

  function setEditMode(on) {
    ed.on = on;
    $("editPoseBtn").classList.toggle("on", on);
    $("editPoseBtn").textContent = on ? "✥ Editing pose" : "✥ Edit pose";
    $("poseBox").classList.toggle("editing", on);
    onEditModeChange?.(on);
  }

  $("editPoseBtn").onclick = () => setEditMode(!ed.on);
  jointSel.onchange = () => { ed.joint = jointSel.value; syncPanel(); };
  $("resetJointBtn").onclick = () => { if (ed.joint) set(ed.joint, [0, 0, 0]); };
  $("resetStateBtn").onclick = () => {
    const c = charKey();
    if (edits[c]) delete edits[c][stateKey()];
    onChange(); syncPanel();
  };
  $("resetAllBtn").onclick = () => {
    for (const k of Object.keys(edits)) delete edits[k];
    onChange(); syncPanel();
  };

  // --------------------------------------------------------------- export

  $("poseExportBtn").onclick = () => {
    posePreview();
    const characters = {};
    for (const [char, states] of Object.entries(edits)) {
      for (const [st, bones] of Object.entries(states)) {
        if (!Object.keys(bones).length) continue;
        characters[char] = characters[char] || {};
        const block = { offsetsDeg: {} };
        for (const [bone, d] of Object.entries(bones)) block.offsetsDeg[bone] = d;
        // The absolute local rotation each edited bone ends up at, for the
        // state on screen right now — the number a pose table wants, where the
        // offset is the number a note about the clip wants. Only meaningful
        // for the state currently posed, so it is stamped with its time.
        if (char === charKey() && st === stateKey()) {
          block.atClipTime = Math.round(opts.clipTime() * 1000) / 1000;
          block.resultLocalDeg = {};
          for (const bone of Object.keys(bones)) {
            const o = boneNamed(bone);
            if (!o) continue;
            block.resultLocalDeg[bone] = [o.rotation.x, o.rotation.y, o.rotation.z]
              .map((r) => Math.round((r / DEG) * 100) / 100);
          }
        }
        characters[char][st] = block;
      }
    }
    const payload = {
      kind: "render3d-pose-edits",
      exported: new Date().toISOString(),
      note: "Rotation offsets in DEGREES, in each bone's parent frame, applied "
        + "on top of the state's clip for its whole duration (render3d/src/pose.js "
        + "edit layer). `resultLocalDeg` is the bone's absolute local rotation at "
        + "`atClipTime` with every live layer applied — the shape a pose table "
        + "entry takes (billboards/src/mannequin.js POSES).",
      characters,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pose-edits.json";
    a.click();
    status(editCount()
      ? `exported ${editCount()} joint edit(s) — hand pose-edits.json back for the clip tables`
      : "exported an empty pose payload — no joints have been moved");
  };

  // -------------------------------------------------------------- the viewer

  /** Handle positions for the current pose, in game-pixel space. */
  function handles() {
    const out = [];
    for (const b of boneList()) {
      b.getWorldPosition(vA);
      const p = project(vA);
      if (!p || p.behind) continue;
      out.push({ bone: b, x: p.x, y: p.y });
    }
    return out;
  }

  function draw(ctx, zoom) {
    if (!ed.on) return;
    const r = Math.max(3, 5 / zoom);
    ctx.save();
    ctx.lineWidth = 1.5 / zoom;
    for (const h of handles()) {
      const sel = h.bone.name === ed.joint;
      const edited = !!(bucket() || {})[h.bone.name];
      // A bone's own segment, so the skeleton reads as a skeleton and not a
      // cloud of dots.
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
      ctx.arc(h.x, h.y, sel ? r * 1.7 : r, 0, Math.PI * 2);
      ctx.fillStyle = sel ? "rgba(159, 211, 159, 0.95)"
        : edited ? "rgba(211, 198, 159, 0.9)" : "rgba(150, 170, 220, 0.75)";
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

  /** Screen-space angle of `pt` about `pivotWorldVec`, in game-pixel space. */
  function angleAbout(pivotPt, pt) {
    return Math.atan2(pt.y - pivotPt.y, pt.x - pivotPt.x);
  }

  /** True when the press was claimed by a handle (so the viewer must not pan). */
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
    // Pose first: pointer events outrun the frame loop, and measuring the
    // error against a stale body applies the same correction twice — which
    // reads as a joint that spins far past where it was dragged.
    posePreview();
    drag.pivot.getWorldPosition(vA);
    const pv = project(vA);
    if (!pv) return true;

    let delta;
    if (drag.mode === "limb") {
      // Absolute: the limb points where the pointer is, which is what "rotate
      // the parent toward the mouse" means to a hand.
      drag.bone.getWorldPosition(vA);
      const hp = project(vA);
      if (!hp) return true;
      delta = angleAbout(pv, pt) - angleAbout(pv, hp);
    } else {
      // A root bone has no limb to point: swing it by however far the pointer
      // swung about it.
      const a = angleAbout(pv, pt);
      delta = a - ed.lastAngle;
      ed.lastAngle = a;
    }
    if (!delta) return true;
    // Screen y runs down, and a mirrored blit flips the sense of the swing.
    delta = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const signed = -delta * (mirror() < 0 ? -1 : 1);

    // Rotate about the axis pointing at the viewer, so the on-screen swing is
    // exactly the swing that was asked for under the ¾ camera.
    camera().getWorldDirection(vAxis);
    vAxis.negate().normalize();
    q1.setFromAxisAngle(vAxis, signed);

    // World delta -> the rotated bone's parent frame, which is the frame the
    // stored offsets (and the clip's own keyframes) live in.
    drag.rotate.parent.getWorldQuaternion(qp);
    q2.copy(qp).invert().multiply(q1).multiply(qp);

    const cur = get(drag.rotate.name);
    eul.set(cur[0] * DEG, cur[1] * DEG, cur[2] * DEG, "XYZ");
    q1.setFromEuler(eul).premultiply(q2);
    eul.setFromQuaternion(q1, "XYZ");
    ed.joint = drag.rotate.name;
    set(drag.rotate.name, [eul.x / DEG, eul.y / DEG, eul.z / DEG]);
    return true;
  }

  function pointerUp() {
    if (!ed.dragging) return;
    ed.dragging = null;
  }

  canvas.addEventListener("dblclick", () => { if (ed.on) setEditMode(false); });

  fillJoints();
  setEditMode(false);

  // A probe for the smoke test (tools/smoke_pose_edit.mjs): where the handles
  // are and what has been moved, without scraping pixels.
  if (typeof window !== "undefined") {
    window.__poseEditor = { handles, edits, state: ed };
  }

  return {
    get on() { return ed.on; },
    get joint() { return ed.joint; },
    layerEdits, editKey, draw, pointerDown, pointerMove, pointerUp,
    fillJoints, syncPanel, setEditMode,
  };
}
