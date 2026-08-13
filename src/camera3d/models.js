// Real rigged models inside the camera's own scene — the `?render=3d` half of
// `?camera=3d`.
//
// The other fighters in this mode are CARDS: a sprite frame, or (under
// `?render=billboard`) a posed-model texture, on a quad. That is right for
// those backends — a sprite is a drawing and a billboard is a billboard. It
// would be wrong here. `?render=3d` already has the fighter as live rigged
// geometry in a three.js scene; rendering it to an offscreen texture and
// pasting that flat card into a 3D scene would throw away the exact thing the
// backend exists to provide. So the rig goes in the scene, and the game's own
// perspective camera renders it:
//
//   * real perspective and foreshortening, from the actual viewing angle,
//     instead of the fixed ¾ offscreen camera;
//   * real depth against the extruded platforms — a fighter behind a slab is
//     occluded by the depth buffer, not by a painter's-algorithm sort;
//   * the micro-parallax dial retires, because a moving camera does for real
//     what that dial approximates when blitting flat.
//
// WHAT THIS MODULE OWNS
//
//   * a group in WORLD space, deliberately NOT a child of the sim group: that
//     group's transform is (S, -S, 1), and a negative Y scale mirrors a real
//     model and inverts its winding. Cards do not care; geometry does. So sim
//     coordinates are mapped here, by hand, exactly as makeSimGroup maps them.
//   * a light rig, because the camera's scene has none — every other thing in
//     it is unlit textured quads. The toon materials need lights to have a
//     terminator at all, and the colours come from the same stage-tint
//     derivation the flat path lights with, so a fighter is not lit two
//     different ways depending on a URL flag.
//   * one instance per FIGHTER, not per character: the registry holds a single
//     rig object per character, and two Gojos cannot both be posed from it.

import { Group, HemisphereLight, DirectionalLight } from "../../vendor/three/three.module.js";
import { CAMERA as C } from "../config_camera.js";
import { sceneAdapter } from "../render_backend.js";
import { headHeightTarget } from "../heights.js";
import { fighterTransform } from "../motion.js";

const S = C.simScale;
/** Centre of mass as a fraction of body height — the pivot motion.js rotations
 *  turn about. Same constant as the flat blits, so a tumble reads identically. */
const COM_FRAC = 0.55;

export function makeModels() {
  const group = new Group();
  const lights = new Group();
  const hemi = new HemisphereLight(0xf4f6ff, 0x3a4152, 2.2);
  const key = new DirectionalLight(0xffffff, 1.9);
  // Roughly the flat path's key direction, in world axes: up, and toward the
  // camera-ish side, so the terminator falls where the offscreen render puts it.
  key.position.set(1.5, 2.5, 2.0);
  lights.add(hemi, key);
  group.add(lights);

  let litFor = null;   // stage key the lights were derived for
  let drawn = 0;

  /** Sim pixels -> world units, the same mapping makeSimGroup applies, done
   *  by hand because this group must not inherit that group's -Y flip. */
  const worldX = (x) => (x - C.originX) * S;
  const worldY = (y) => (C.originY - y) * S;

  function syncLights(adapter, stageKey) {
    if (stageKey === litFor) return;
    litFor = stageKey;
    const tint = adapter.lightTint?.();
    if (tint) key.color.setRGB(...tint.key);
  }

  /** Place and pose one fighter's rig. Returns false when this fighter has no
   *  model, so the caller draws them as a card instead — the same
   *  per-character fallthrough the flat path has. */
  function place(f, adapter, aim) {
    const charKey = f.spriteChar || f.charKey;
    const inst = adapter.instance(charKey, f.id);
    if (!inst) return false;

    // The fighter's on-screen height in sim px — the same number the flat
    // blit solves against, so a model is the size its sprites would be.
    // (Summons pass their own scale in the flat path; they are drawn as cards
    // here, so there is no per-actor ratio to carry.)
    const onScreenPx = headHeightTarget(charKey);

    const posed = adapter.poseInstance(inst, charKey, f.animKey, f.animTime, {
      facing: f.facingVis, aim, x: f.x, chestY: f.y - onScreenPx * COM_FRAC,
    });
    if (!posed) return false;

    // Engine motion stays motion.js's, exactly as it is for sprites and for
    // the flat blits — read here and applied to the object instead of to a
    // canvas transform, so game feel does not change with the camera flag.
    const m = fighterTransform(f);
    const root = inst.root;

    // metres -> sim px -> world units. The rig's origin is on the floor
    // between the feet (delivery spec), so this positions the feet.
    const s = (onScreenPx / inst.height) * S * (inst.renderScale ?? 1);
    root.scale.set(s * (m.scaleX ?? 1), s * (m.scaleY ?? 1), s);
    root.position.set(
      worldX(f.x + (m.offsetX || 0)),
      worldY(f.y + (m.offsetY || 0)),
      0,
    );
    // Tumble/swing is a roll in the screen plane, about the centre of mass —
    // the flat path rotates about that same point.
    root.rotation.z = -(m.rotation || 0);
    // Outline width is authored in blitted pixels; in-scene it has to be a
    // local displacement, since the rig is uniformly scaled to game size.
    adapter.setOutlineScale?.(root, inst.height, onScreenPx);

    if (root.parent !== group) group.add(root);
    root.visible = true;
    return true;
  }

  return {
    group,
    count: () => drawn,

    /** Which fighters this layer drew this frame, so billboards.js can skip
     *  them. Returns a Set of fighter ids — empty when the active backend has
     *  no object adapter (sprite and billboard modes), which is what makes
     *  this whole layer inert unless `?render=3d` is on. */
    update(st) {
      drawn = 0;
      const adapter = sceneAdapter();
      const live = new Set();
      const handled = new Set();
      if (!adapter || adapter.kind !== "object" || !adapter.ready?.()) {
        // Nothing of ours on screen: hide anything left from a previous frame
        // (a backend cannot change mid-session, but a match can end).
        adapter?.releaseExcept?.(live);
        for (const child of group.children) if (child !== lights) child.visible = false;
        return handled;
      }
      syncLights(adapter, st.stageKey);

      for (const child of group.children) if (child !== lights) child.visible = false;
      for (const f of st.fighters) {
        if (f.dead || f.respawnTimer > 0) continue;
        // A transformed fighter (Megumi as Mahoraga) draws from the install's
        // own still art in every mode; leave it to the card path.
        if (f.installs?.sprite) continue;
        const aim = nearestOpponentPoint(f, st);
        if (!place(f, adapter, aim)) continue;
        live.add(`${f.spriteChar || f.charKey}#${f.id}`);
        handled.add(f.id);
        drawn++;
      }
      adapter.releaseExcept?.(live);
      return handled;
    },
  };
}

/** The auto-aim target, mirroring render.js: the nearest live opponent's
 *  chest, or null. Duplicated rather than imported because render.js's copy is
 *  module-private and this is four lines. */
function nearestOpponentPoint(f, st) {
  let best = null;
  let bestD = Infinity;
  for (const o of st.fighters) {
    if (o === f || o.dead || o.respawnTimer > 0) continue;
    if (o.team != null && f.team != null && o.team === f.team) continue;
    const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best ? { x: best.x, y: best.y - 80 } : null;
}
