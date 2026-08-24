// THE BENCH'S FOUNDATION — the canvas, the geometry it is drawn in, the names
// of the things it can edit, and the one mutable `state` every panel reads.
//
// It is here rather than at the top of workbench.js because workbench.js was
// 6,300 lines and 233 functions in a single module, which is how a fix in one
// panel came to change another: everything could see everything, so nothing
// declared what it actually needed. The bench is layered now, and this is the
// bottom layer — it imports from the GAME and from nothing else in the bench,
// so every other bench module can depend on it and none of them can create a
// cycle through it.
//
// What belongs here: a fact the whole bench agrees on. What does not: anything
// that reads a sprite's data (bench_model.js), places a shared drawing
// (workbench.js's viewer), or touches a panel.

import { SPRITE_ACTORS, CHARACTER_KEYS, STAGED_CHARACTER_KEYS } from "../../src/characters.js";
import { replacementKind, improvementKind, NOTE_FIELDS } from "../src/sprites.js";

export const $ = (id) => document.getElementById(id);

export const canvas = $("stage");
export const ctx = canvas.getContext("2d");

// The floor line, in canvas pixels. Sits low in the frame on purpose: a pose
// extends UPWARD far more than it extends down — an ultimate, a ledge hang, an
// up-heavy all reach for the top of the canvas, while nothing but a weapon tip
// goes below the feet — so the headroom is worth more than the footroom.
export const GROUND_Y = 516;
// The platform the stage draws, and how far onto it the size benchmark stands.
export const PLATFORM_W = 680;
// Centred on whatever the canvas is, rather than on the 760 it used to be, so
// widening the viewer keeps the platform and the comparison slot under the
// middle of it. `canvas` is not defined yet at module scope, so this is a
// getter rather than a constant.
export const platformX = () => canvas.width / 2 - PLATFORM_W / 2;
/** The grab handles on the canvas — a drag target big enough to hit and small
 *  enough not to hide what it is placing. */
export const HANDLE_R = 7;
/** One decimal place, which is as fine as any of these numbers is read. */
export const round1 = (v) => Math.round(v * 10) / 10;

export const BENCHMARK_INSET = 78;
export const CELL_W = 313.5;

// Scalar fields the workbench can edit. `anchors` is edited too but is nested,
// so snapshot/restore/compare handle it separately.
export const EDITABLE = ["renderScale", "ox", "bodyBottom", "rotationDeg", "faceLeft",
                  // Shared drawings only: a nudge in GAME pixels away from the
                  // point the spawn site paints them on. A pose uses `ox` and
                  // `bodyBottom` for the same two directions, because a pose is
                  // placed inside its cell and one of these is not.
                  "dx", "dy",
                  // ...and where the MOVE creates it, which is a different
                  // point entirely: `dx`/`dy` move the picture onto the spawn
                  // point, these move the spawn point onto the character (a
                  // lance of blood should leave the finger). Exported as a note
                  // against the kit, since `ox`/`oy` live in characters.js.
                  "spawnOx", "spawnOy",
                  // A few frames of ramp as an energy shot leaves, in seconds
                  // (sharedFadeIn). Set in the Play window, where whether it is
                  // enough is a thing you can actually see.
                  "fadeIn",
                  "needsReplacement", "wantsImprovement",
                  "replacementNote", "improvementNote"];
// Fields whose VALUE is a kind string rather than a number, so a change of kind
// is a change and `false` means "cleared" rather than "unset".
export const KIND_FIELDS = { needsReplacement: replacementKind, wantsImprovement: improvementKind };
// Fields that are true/false rather than a number, so comparison and export
// treat them differently (and `false` is a meaningful value, not "unset").
export const BOOLEAN_FIELDS = new Set(["faceLeft"]);
// Free text written beside a flag. Compared as strings and exported verbatim;
// the empty string is meaningful, clearing a note rather than leaving it.
export const TEXT_FIELDS = new Set(Object.values(NOTE_FIELDS));

// A sheet cell usually serves several states at once, so the pose list needs
// one of them to name it by. Order is "what was this cell drawn as": movement
// before the attacks that borrow it, because on the original 4x5 sheets row 1
// is the run row and row 4 the crouch row, and those cells are sprint and
// crouch poses that attacks were later pointed at for want of anything better.
export const STATE_ORDER = [
  "idle", "run", "dash", "crouch", "crouchAttack", "jump", "fall", "land",
  "ledge", "shield", "dodge", "dodge_roll", "dodge_air",
  "light", "airLight", "sideHeavy", "upHeavy", "downHeavy", "charge",
  "specialNeutral", "specialSide", "specialDown", "ult", "hurt", "dizzy",
  "win",
];

export const STATE_LABELS = {
  idle: "Idle", run: "Run", dash: "Dash", crouch: "Crouch",
  crouchAttack: "Crouch attack", jump: "Jump", fall: "Fall", land: "Land",
  ledge: "Ledge hang", shield: "Guard", dodge: "Dodge", dodge_roll: "Dodge roll",
  dodge_air: "Air dodge", light: "Light attack", airLight: "Air attack",
  sideHeavy: "Side heavy", upHeavy: "Up heavy", downHeavy: "Down heavy",
  charge: "Charge", specialNeutral: "Special · neutral",
  specialSide: "Special · side", specialDown: "Special · down",
  ult: "Ultimate", hurt: "Hurt", dizzy: "Dizzy", win: "Victory",
};

export const stateLabel = (name) => STATE_LABELS[name] || name;
export const stateRank = (name) => {
  const i = STATE_ORDER.indexOf(name);
  return i < 0 ? STATE_ORDER.length : i;
};

// Three kinds of entry in the character list are not fighters — the third,
// "All Recently Updated Poses", is not even a sprite set; see recentUpdates().
//
// SPRITE_ACTORS (Mahoraga) own a full sprite set and are drawn exactly like a
// fighter, so everything here works on them unchanged — they simply have no
// kit. Their poses are listed from TRANSFORM_POSES even before any art exists,
// so the set can be tracked as it arrives rather than appearing all at once.
//
// "Other Sprites" is the shared effect/summon art. It has no per-frame
// placement data at all — the code that spawns each one decides its size and
// position — so the placement half of the panel does not apply to it and is
// hidden. What it supports is looking at the art and flagging it.
export const OTHER_KEY = "__other";
export const OTHER_LABEL = "Other Sprites";
export const ACTOR_KEYS = Object.keys(SPRITE_ACTORS);

// Fighters the workbench edits: the roster, plus the ones still staged.
//
// A staged fighter is off the select screen because their art is not finished
// (STAGED_CHARACTER_KEYS, src/characters.js) — which makes them exactly the set
// somebody needs this tool for. Their sprites arrive through the same intake,
// land on the same updated list, and wait for the same approval; leaving them
// out meant a delivery could not be looked at until the fighter was already
// live, which is backwards. They are labelled in the dropdown rather than
// hidden, because "not in the game yet" changes what an approval means: it
// settles what the art WILL be, not what a player sees today.
export const WB_FIGHTERS = [...CHARACTER_KEYS, ...STAGED_CHARACTER_KEYS];
export const isStaged = (key) => STAGED_CHARACTER_KEYS.includes(key);

// The entry that is not a sprite set at all: a cross-character work list of
// poses an intake round wrote over work already done. See recentUpdates().
export const RECENT_KEY = "__recent";
export const RECENT_LABEL = "All Recently Updated Poses";

// Its sibling: the poses somebody has asked to have DRAWN AGAIN. The updated
// list answers "what landed and still needs placing"; this one answers "what
// did I reject", which is the question a request round is written from and
// which was only answerable by opening all twenty-eight characters in turn.
//
// A flag is not a rejection once the pose has been pointed at another drawing.
// That falls out of where the flag is read rather than being special-cased
// here: `needsReplacement` reads the POSE, and the pose mirrors whichever
// option it currently uses (poseView), so choosing a good drawing takes it off
// this list while the bad drawing keeps its own tag for the variants menu.
export const FLAGGED_KEY = "__flagged";
export const FLAGGED_LABEL = "All Needing Regeneration";

// THE INVERSE OF THE WHOLE PANEL: one pose, every character.
//
// The dropdown normally asks "which character", and the grid then asks "which
// of their poses" — which is the right way round for placing a delivery and
// the wrong way round for judging one. Is everybody's `attack_light_b` a punch
// thrown with the near arm? Are the crouches all crouching to the same height?
// Those are questions about ONE POSE ACROSS THE ROSTER, and answering them
// meant opening thirty-five characters in turn and remembering what you saw.
//
// So this entry swaps the two axes: the pose select above the grid becomes the
// list of poses the game draws, and the grid becomes the characters that have
// the one you picked. Everything below the grid is unchanged — each cell still
// selects a real character's real pose, and every control goes on editing it.
export const ACTIONS_KEY = "__actions";
export const ACTIONS_LABEL = "Actions";

export const isOther = (charKey) => charKey === OTHER_KEY;
export const isActor = (charKey) => ACTOR_KEYS.includes(charKey);
export const inActions = () => state.group === ACTIONS_KEY;
export const inRecent = () => state.group === RECENT_KEY;
export const inFlagged = () => state.group === FLAGGED_KEY;
/** Either cross-character work list — neither is a sprite set. */
export const inList = () => inRecent() || inFlagged();

export const BACKGROUNDS = [
  ["#12151f", "dark"], ["#5c6478", "grey"], ["#f2f4f8", "white"],
  ["#0f7a3d", "green"], ["#ff00ff", "magenta"], ["#7a3d0f", "brown"],
];

export const state = {
  char: "gojo", frame: null, bg: BACKGROUNDS[0][0], zoom: 1.9,
  originals: {}, originalHeads: {}, originalHeadOverride: {}, originalAnims: {},
  originalSpans: {}, undo: [], redo: [],
  // Which anchor the arrow keys act on — set by whatever you last moved, not by
  // a separate selection step. Every SHOWN anchor is draggable regardless.
  anchor: null,
  anchorShown: {},     // name -> false to hide; anchors are shown by default
  // "char/frame" the centre of mass was asked for on despite nothing turning
  // that pose. Session-only: it changes what the panel offers, not the art.
  anchorForced: new Set(),
  dragging: false,
  dragAttack: null,
  // Which hurtbox case the panel is editing on this pose, when the drawing
  // carries more than one (a hurt pose is both "reeling" and "tumbling").
  // Session-only, and it changes what is drawn and dragged, not the art.
  fitCase: null,
  // Dragging the hurtbox: "move" on its body, or the corner being pulled.
  dragFit: null,
  // Dragging the hit circle: "move" on its centre, "size" on its rim.
  dragHit: null,
  // Dragging the strike point — where this attack's blow lands on this drawing.
  // A bare flag rather than a mode: there is one handle and one thing it does.
  dragStrike: false,
  // RECENT_KEY while the cross-character updated list is open. `char` stays a
  // real character throughout — every control below edits the pose that is
  // selected, and which list it was picked from changes nothing about that.
  group: null,
  // The fighter whose "Effects this fighter uses" list is open, while the thing
  // being EDITED is a shared drawing in `__other`. The two have to be held
  // apart: a shared drawing's numbers only exist in the shared set, so `char`
  // has to go there, but the list you picked it from is a question about a
  // kit and belongs to the fighter. Null whenever the list is not open.
  effectsOwner: null,
  view: "unedited",    // key into VIEWS
  // The pose the Actions view is showing across the roster. Only meaningful
  // while that view is open; kept out of `frame`, which is always the pose
  // being edited on the character in `char`.
  action: "idle_a",
  // The secondary action being previewed: the canvas shows the sprite it is
  // pointed at now, and the saved choice stands where the size benchmark does,
  // so a reassignment can be read as a before/after rather than from memory.
  actionRow: null,     // { name, index, saved }
};

export const canvasCentreX = () => canvas.width / 2;