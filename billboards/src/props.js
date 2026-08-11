// Props, weapons and physics chains — the parts of a fighter that are not the
// body: Nobara's hammer, Maki's polearm, Mahoraga's wheel, Mei Mei's braid.
//
// THE CONTRACT (mirrored in docs/asset-requests.md): props and chains are part
// of the RIG, never separate files. A delivered .glb carries its own weapon
// geometry hung on named bones; what this module adds is
//
//   * the NAMING those bones must use, so clips and tools can find them:
//       Prop_Main        the weapon hand's prop (sword, hammer, broom…)
//       Prop_Off         an off-hand or second prop
//       Prop_Float       a prop that rides near the body but in nobody's hand
//                        (Mahoraga's wheel, above the head)
//       Chain_<name>_<i> physics chain segments, i = 0 at the root
//        (e.g. Chain_braid_0 … Chain_braid_3 hanging from Head)
//
//   * per-character EXPECTATIONS — which props/chains each fighter's rig must
//     carry, from the roster table in docs/asset-requests.md. The intake tool
//     validates a delivery against this, and the workbench lists it.
//
//   * PLACEHOLDER geometry so the mannequin carries the same props: a fighter
//     whose real weapon changes their silhouette must be proven against a
//     stand-in of that weapon, not against empty hands — clip timing around a
//     two-handed spear is nothing like a punch.
//
// PHYSICS. Chains are secondary motion — braids, tendrils — and they are
// DETERMINISTIC in B0: a time-driven pendulum sway, not an integrated
// simulation. That is a caching decision, not laziness: the pose cache is
// keyed by (state, time, aim), and an integrator carries hidden state that
// would make identical keys draw different pixels. The sway reads as motion
// at game size; if a fighter ever needs true simulation, their rig sets
// `simulate: true` on the chain and pays for it with per-frame renders
// (renderer.js skips the cache for such rigs).

const DEG = Math.PI / 180;

// ------------------------------------------------- per-character expectations
//
// From the roster table (docs/asset-requests.md). A character absent here has
// bare hands and no chains. `kind` picks the placeholder shape for the
// mannequin; a delivered rig brings its own geometry on the same bone.

export const CHARACTER_PROPS = {
  yuta:      [{ bone: "Prop_Main", kind: "sword", hand: "RightHand" }],
  nanami:    [{ bone: "Prop_Main", kind: "sword", hand: "RightHand" }],
  toji:      [{ bone: "Prop_Main", kind: "spear2h", hand: "RightHand" }],
  reggie:    [{ bone: "Prop_Main", kind: "umbrella", hand: "RightHand" }],
  nobara:    [{ bone: "Prop_Main", kind: "hammer", hand: "RightHand" },
              { bone: "Prop_Off", kind: "nail", hand: "LeftHand" }],
  meimei:    [{ bone: "Prop_Main", kind: "axe", hand: "RightHand" }],
  maki:      [{ bone: "Prop_Main", kind: "spear2h", hand: "RightHand" }],
  momo:      [{ bone: "Prop_Main", kind: "broom", hand: "RightHand" }],
  gakuganji: [{ bone: "Prop_Main", kind: "guitar", hand: "LeftHand" }],
  mahoraga:  [{ bone: "Prop_Float", kind: "wheel", hand: null }],
};

export const CHARACTER_CHAINS = {
  meimei: [{ name: "braid", from: "Head", segments: 4, length: 0.55, sway: 14 }],
  dagon:  [{ name: "tendrilL", from: "Head", segments: 3, length: 0.3, sway: 10 },
           { name: "tendrilR", from: "Head", segments: 3, length: 0.3, sway: 10 }],
};

// ------------------------------------------------------- two-handed weapons
//
// A polearm is not swung one-handed, and nothing in the clip vocabulary knows
// that: the poses drive the striking arm, and the engine's aim/reach solve
// re-targets it, which moves the weapon — so an authored "left hand on the
// shaft" pose would detach the moment a strike aimed anywhere. The off hand
// has to be SOLVED onto the shaft after everything else has moved it
// (applyTwoHandGrip in ik.js), which makes two-handedness a property of the
// PROP, declared here, not a property of any clip.
//
// `spacing` is how far down-shaft the off hand grips from the main hand,
// metres — a naginata grip is roughly two forearms apart.

export const TWO_HANDED_KINDS = {
  spear2h: { spacing: 0.5 },
};

/** The two-handed prop a fighter carries, or null. `{ bone, spacing }`. */
export function twoHandGrip(charKey) {
  for (const p of CHARACTER_PROPS[charKey] || []) {
    const th = TWO_HANDED_KINDS[p.kind];
    if (th) return { bone: p.bone, spacing: th.spacing, hand: p.hand };
  }
  return null;
}

// ------------------------------------------------------- body morphs
//
// Mahito's Idle Transfiguration: his own body is the weapon, and its SHAPE
// changes per attack — a club arm on the heavies, a drawn-out blade arm on
// the special. No clip can author that (clips carry rotations, not shape),
// and no delivery can bake it (one rig, one bind). So it is an engine layer:
// per-state BONE SCALES, declared here, applied after the clip poses the rig
// (applyMorphs in ik.js). A scaled bone scales everything it carries — skin
// and children — which is exactly what a swelling limb wants; and because
// the scale is a pure function of (state, time) it joins the pose cache
// without poisoning it.
//
// Gameplay parity holds: hurtboxes and reach stay sprite-derived on every
// backend, so the club arm LOOKS enormous and hits exactly like the sprite.
//
// Schema: CHARACTER_MORPHS[char][clipName] = [{ bone, scale }] where scale
// is a scalar (uniform swell) or [x, y, z] in the bone's local frame
// (y runs down the bone on these rigs — the stretch axis for a blade).

export const CHARACTER_MORPHS = {
  mahito: {
    // The heavies land with a club arm: the whole striking arm swollen from
    // the shoulder, hand included.
    sideHeavy:  [{ bone: "RightArm", scale: 1.55 }],
    upHeavy:    [{ bone: "RightArm", scale: 1.55 }],
    downHeavy:  [{ bone: "RightArm", scale: 1.6 }],
    // The special draws the forearm out into a blade: long and thin past the
    // elbow, the hand flattened into the tip.
    specialNeutral: [
      { bone: "RightForeArm", scale: [0.7, 1.9, 0.7] },
      { bone: "RightHand", scale: [0.8, 1.3, 0.5] },
    ],
    // The charge gathers mass in BOTH arms — visibly mid-transfiguration.
    charge: [
      { bone: "RightArm", scale: 1.3 },
      { bone: "LeftArm", scale: 1.3 },
    ],
  },
};

/** Every bone this fighter's morphs ever touch — the reset set. */
export function morphBones(charKey) {
  const states = CHARACTER_MORPHS[charKey];
  if (!states) return null;
  const bones = new Set();
  for (const list of Object.values(states)) for (const m of list) bones.add(m.bone);
  return bones;
}

// ------------------------------------------------------- placeholder shapes
//
// Crude on purpose, like the mannequin itself: enough silhouette to author
// and judge clips against, unmistakably not delivered art. Sizes in metres.
// Each builder returns a Group whose origin is the GRIP (or mount) point.

const SHAPES = {
  sword(THREE, mat) {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.06), mat);
    blade.position.y = 0.45;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.05), mat);
    guard.position.y = 0.08;
    g.add(blade, guard);
    return g;
  },
  spear2h(THREE, mat) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.9, 0.035), mat);
    shaft.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 6), mat);
    head.position.y = 1.5;
    g.add(shaft, head);
    return g;
  },
  hammer(THREE, mat) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.04), mat);
    handle.position.y = 0.28;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.14), mat);
    head.position.y = 0.62;
    g.add(handle, head);
    return g;
  },
  nail(THREE, mat) {
    const nail = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.22, 6), mat);
    nail.rotation.x = 90 * DEG;
    return nail;
  },
  axe(THREE, mat) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 0.04), mat);
    handle.position.y = 0.4;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.24), mat);
    blade.position.set(0, 0.85, 0.12);
    g.add(handle, blade);
    return g;
  },
  broom(THREE, mat) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.03), mat);
    shaft.position.y = 0.35;
    const brush = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), mat);
    brush.position.y = -0.25;
    brush.rotation.x = Math.PI;
    g.add(shaft, brush);
    return g;
  },
  guitar(THREE, mat) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.09), mat);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.04), mat);
    neck.position.y = 0.45;
    g.add(body, neck);
    return g;
  },
  umbrella(THREE, mat) {
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.95, 0.025), mat);
    rod.position.y = 0.35;
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.18, 8), mat);
    canopy.position.y = 0.75;
    g.add(rod, canopy);
    return g;
  },
  wheel(THREE, mat) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 18), mat);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.02, 0.02), mat);
    const spoke2 = spoke.clone();
    spoke2.rotation.z = Math.PI / 2;
    const g = new THREE.Group();
    g.add(wheel, spoke, spoke2);
    return g;
  },
};

// ------------------------------------------------------------------ attach

/** Hang a character's expected props and chains on a rig that lacks them —
 *  the mannequin path. Delivered rigs that already carry a named prop bone
 *  keep their own; only the missing ones get placeholders, so a rig delivered
 *  with a real sword is never handed a grey one too. */
export function attachPlaceholders(THREE, root, charKey, height, material) {
  const findBone = (name) => root.getObjectByName(name);

  for (const prop of CHARACTER_PROPS[charKey] || []) {
    if (findBone(prop.bone)) continue;
    const bone = new THREE.Bone();
    bone.name = prop.bone;
    const shape = SHAPES[prop.kind]?.(THREE, material);
    if (shape) bone.add(shape);
    if (prop.bone === "Prop_Float") {
      // Floating props ride above the head — Mahoraga's wheel.
      const head = findBone("Head") || root;
      bone.position.set(0, 0.35, 0);
      head.add(bone);
    } else {
      const hand = findBone(prop.hand) || root;
      // Grip: rest the prop across the palm, blade up.
      bone.rotation.z = prop.hand === "LeftHand" ? 65 * DEG : -65 * DEG;
      hand.add(bone);
    }
  }

  for (const chain of CHARACTER_CHAINS[charKey] || []) {
    if (findBone(`Chain_${chain.name}_0`)) continue;
    const from = findBone(chain.from) || root;
    let parent = from;
    const segLen = chain.length / chain.segments;
    for (let i = 0; i < chain.segments; i++) {
      const bone = new THREE.Bone();
      bone.name = `Chain_${chain.name}_${i}`;
      bone.position.set(0, i === 0 ? -0.02 : -segLen, i === 0 ? -0.06 : 0);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.045, segLen * 0.9, 0.045), material);
      seg.position.y = -segLen / 2;
      bone.add(seg);
      parent.add(bone);
      parent = bone;
    }
  }
}

/** Chains a rig carries, by inspection — delivered or placeholder alike. */
export function chainsOf(root) {
  const chains = new Map();
  root.traverse((o) => {
    const m = /^Chain_(.+)_(\d+)$/.exec(o.name || "");
    if (m) chains.set(m[1], Math.max(chains.get(m[1]) || 0, Number(m[2]) + 1));
  });
  return chains;
}

/** Prop bones a rig carries, by inspection. */
export function propsOf(root) {
  const props = [];
  root.traverse((o) => {
    if (/^Prop_/.test(o.name || "")) props.push(o.name);
  });
  return props;
}

/** Deterministic secondary motion: pendulum sway on every chain, driven by
 *  the pose clock so the cache stays honest (same key -> same pixels). Runs
 *  after the mixer poses the body; the chain hangs off whatever the head or
 *  hips are doing, which is what sells it as attached. */
export function swayChains(root, time, charKey) {
  const spec = CHARACTER_CHAINS[charKey];
  root.traverse((o) => {
    const m = /^Chain_(.+)_(\d+)$/.exec(o.name || "");
    if (!m) return;
    const conf = spec?.find((c) => c.name === m[1]);
    const amp = (conf?.sway ?? 10) * DEG;
    const i = Number(m[2]);
    // Later segments lag and swing wider — a whip, not a rod.
    o.rotation.x = Math.sin(time * 2.1 + i * 0.9) * amp * (0.4 + i * 0.35);
    o.rotation.z = Math.cos(time * 1.7 + i * 0.7) * amp * 0.3 * (0.4 + i * 0.35);
  });
}
