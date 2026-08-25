// THE SPRITE PICKER — every drawing a character has, shown rather than named.
//
// Choosing what an action looks like is a visual decision, and a dropdown of
// file names is not one. This is the grid that answers it: lazily paged, with
// a right-click menu for enlarging a tile and for tagging a drawing nobody
// should use again.
//
// It is a LEAF of the bench. It reads the model (which poses exist, what each
// one is drawn from, which drawings are flagged) and it hands its answer back
// through the `onPick` the caller supplied. The one thing it cannot do by
// itself is repaint the panels around it, so that arrives once at boot as a
// hook rather than as an import — which is what keeps this module off the
// cycle that would otherwise run picker → workbench → picker.

import {
  loadFrame, frameImage, frameMeta, loadSpriteFile, spriteFileImage,
} from "../../src/assets.js";
import { $, canvas, state } from "./bench_state.js";
import {
  frameLabel, statesUsing, allFramesOf, variantEntry, poseView,
  variantFlagEdits, remember, drawnFiles, ensureVariantOption,
} from "./bench_model.js";

/** THE DRAWINGS THE GAME IS CURRENTLY SHOWING, as of the moment this grid
 *  opened. What the delete option is gated on: anything else — an alternate,
 *  a superseded delivery, a sheet cell no animation has ever reached — is by
 *  definition safe to throw away, and those are the likeliest to be junk.
 *
 *  A snapshot rather than a live question because it is asked of every tile
 *  and the answer walks every animation state; the set cannot change while a
 *  modal grid is up, since changing it means picking a drawing, which closes
 *  the grid. */
let pickerDrawn = new Set();

/** Repaint the pose list and the panel after a flag written from a tile. Set
 *  once at boot by workbench.js; the picker never imports it, so this module
 *  stays a leaf. */
let onFlagChanged = () => {};
export function initSpritePicker(hooks = {}) {
  onFlagChanged = hooks.onFlagChanged || onFlagChanged;
}

/** Open the grid.
 *
 *  `drawings` is an explicit list of one pose's own drawings — "which of these
 *  do I want to see beside it". Without it the grid is the CHARACTER'S WHOLE
 *  CATALOGUE, every drawing they have: what each pose points at, plus every
 *  other drawing banked on it. Choosing art is a question about images, not
 *  about poses, so an alternate nobody currently draws is as valid an answer
 *  as the one in play. */
export function openSpritePicker({ title, sub, current, currentPose = null, onPick,
                           drawings = null, primaryOnly = false }) {
  const modal = $("spritePicker");
  const grid = $("pickerGrid");
  $("pickerTitle").textContent = title;
  $("pickerSub").textContent = sub;
  grid.innerHTML = "";
  pickerDrawn = drawnFiles(state.char);
  closePickerMenu();
  pickerPage = null;
  // Scrolling takes the tile out from under the pointer, so whatever it was
  // showing goes with it.
  grid.onscroll = () => { cancelDwell(); closePickerPreview(); };

  if (drawings) {
    for (const d of drawings) grid.appendChild(buildDrawingTile(d, current, onPick));
    modal.hidden = false;
    closePickerPreview();
    grid.querySelector(".picker-tile.current")?.scrollIntoView({ block: "center" });
    return;
  }

  // A roster character has 50-odd poses and as many banked alternates again,
  // and every tile costs an image fetch. So the catalogue is laid down a page
  // at a time and the rest follows the scroll — the sprites worth looking at
  // are at the top by construction, and most choices never reach the bottom.
  pickerPage = {
    items: spriteCatalogue(state.char, currentPose ?? current, primaryOnly),
    at: 0, current, onPick,
  };
  appendPickerPage();
  modal.hidden = false;
  closePickerPreview();
  grid.querySelector(".picker-tile.current")?.scrollIntoView({ block: "center" });
}

export const PICKER_PAGE = 48;

export let pickerPage = null;

export let pickerWatcher = null;

export function appendPickerPage() {
  if (!pickerPage) return;
  const grid = $("pickerGrid");
  const { items, at, current, onPick } = pickerPage;
  const end = Math.min(items.length, at + PICKER_PAGE);
  for (let i = at; i < end; i++) {
    const item = items[i];
    if (item.head) {
      const head = document.createElement("h4");
      head.className = "picker-head";
      head.textContent = item.head;
      grid.appendChild(head);
      continue;
    }
    grid.appendChild(buildDrawingTile(item, current, onPick));
  }
  pickerPage.at = end;

  // The sentinel rides at the end of the grid: when it comes into view there
  // is more catalogue below the fold, so the next page is laid down.
  pickerWatcher?.disconnect();
  pickerWatcher = null;
  grid.querySelector(".picker-more")?.remove();
  if (end >= items.length) return;
  const more = document.createElement("div");
  more.className = "picker-more";
  more.textContent = `${items.length - end} more…`;
  grid.appendChild(more);
  if (typeof IntersectionObserver !== "function") return;
  pickerWatcher = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) appendPickerPage();
    // The grid is the scroller, so it is also the root the sentinel is
    // measured against.
  }, { root: grid, rootMargin: "400px" });
  pickerWatcher.observe(more);
}

/** The family a sprite key belongs to: everything up to the variant suffix, so
 *  `attack_light_b` and `attack_light_a` are the same family and `crouch_a` and
 *  `crouch_attack_b` are neighbours under `crouch`. */
export function spriteFamily(key) {
  return String(key).split("_")[0];
}

/** Every drawing this character has, nearest first.
 *
 *  Nearest is the pose's own family — the crouches when you are on a crouch —
 *  because a pose is nearly always redrawn by a neighbour of itself. Within
 *  that, what the game actually draws leads what is only banked beside it: an
 *  alternate is a real answer, but the drawing in play is the likelier one.
 */
export function spriteCatalogue(charKey, current, primaryOnly = false) {
  const family = spriteFamily(current);
  const buckets = [[], [], [], [], []];
  const seen = new Set();
  for (const key of allFramesOf(charKey)) {
    const live = frameMeta(charKey, key);
    const used = statesUsing(charKey, key).length > 0;
    const near = spriteFamily(key) === family;
    const drawings = [];
    // The live drawing carries its own option too, when it has one.
    //
    // A DELETE TAG WENT ON AND CAME STRAIGHT BACK OFF. `setDrawingDoomed`
    // writes the tag onto a variant option, creating one where the pose had
    // none — which is the case for every sheet cell nothing draws, the exact
    // place unused art gets refused. But this list rebuilt the primary tile
    // with no `option` at all, and the loop below skips the option whose file
    // the pose is already using, so nothing ever handed the tag back. The tile
    // reads `d.option?.needsReplacement`, so on reopening the picker forty-seven
    // tagged drawings looked untouched. The tags were real the whole time and
    // exported correctly; only the picture of them was missing.
    if (live?.file) {
      drawings.push({ file: live.file, meta: live, primary: true, label: null,
                      option: variantEntry(charKey, key)?.options
                        .find((o) => o.file === live.file) || null });
    }
    // The LIVE option objects, not variantsOf()'s copies: right-clicking a
    // tile writes a deletion tag onto the drawing, and a tag written to a copy
    // is a tag written to nothing.
    for (const o of primaryOnly ? [] : (variantEntry(charKey, key)?.options || [])) {
      if (!o.file || o.file === live?.file) continue;
      drawings.push({ file: o.file, meta: poseView(o), primary: false, label: o.label, option: o });
    }
    for (const d of drawings) {
      if (seen.has(d.file)) continue;
      seen.add(d.file);
      const item = { ...d, pose: key, used, caption: frameLabel(charKey, key).name };
      // In play and in the family first, then the drawings banked beside them,
      // then the same pair for everything outside the family, and the cells
      // nothing draws last with their own alternates.
      const bucket = !used ? 4
        : near ? (d.primary ? 0 : 1)
        : (d.primary ? 2 : 3);
      buckets[bucket].push(item);
    }
  }
  const titles = [
    family ? `The ${family} sprites the game draws` : "What the game draws",
    family ? `Other ${family} drawings` : "Other drawings",
    "Everything else the game draws",
    "Other drawings of those",
    "Sheet cells nothing draws",
  ];
  const out = [];
  buckets.forEach((list, i) => {
    if (!list.length) return;
    out.push({ head: titles[i] });
    out.push(...list);
  });
  return out;
}

export function closeSpritePicker() {
  $("spritePicker").hidden = true;
  cancelDwell();
  pickerWatcher?.disconnect();
  pickerWatcher = null;
  pickerPage = null;
  closePickerMenu();
  closePickerPreview();
}

/** A tile for one DRAWING. Captioned with the pose it belongs to and, for a
 *  drawing the pose is not currently using, what that drawing is. */
export function buildDrawingTile(d, current, onPick) {
  const tile = document.createElement("button");
  const doomed = () => d.option?.needsReplacement === "delete";
  tile.className = "picker-tile"
    + (d.file === current ? " current" : "")
    + (doomed() ? " doomed" : "");
  const cv = document.createElement("canvas");
  cv.width = 132; cv.height = 132;
  tile.appendChild(cv);
  const cap = document.createElement("span");
  const sub = d.label || (d.primary ? (d.used ? "in the game" : "unused") : "alternate");
  cap.innerHTML = `${d.caption ?? d.pose ?? ""}<i>${sub}</i>`;
  tile.appendChild(cap);
  tile.title = `${d.pose ? `${d.pose} — ` : ""}${d.file}`;

  const paint = () => {
    const img = d.img || spriteFileImage(d.file)
      || (d.primary && d.pose ? frameImage(state.char, d.pose) : null);
    const c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    if (!img || !d.meta) {
      c.fillStyle = "rgba(154, 164, 192, 0.5)";
      c.font = "600 10px Inter, sans-serif";
      c.textAlign = "center";
      c.fillText("loading…", cv.width / 2, cv.height / 2);
      loadSpriteFile(d.file).then((ok) => { if (ok) paint(); });
      return;
    }
    const pad = 10;
    const scale = Math.min((cv.width - pad * 2) / d.meta.w, (cv.height - pad * 2) / d.meta.h);
    c.drawImage(img, cv.width / 2 - (d.meta.w * scale) / 2,
                cv.height - pad - d.meta.h * scale, d.meta.w * scale, d.meta.h * scale);
  };
  paint();

  const choose = () => { onPick(d.file, d); closeSpritePicker(); };
  tile.onclick = choose;
  tile.oncontextmenu = (e) => {
    e.preventDefault();
    cancelDwell();
    closePickerPreview();
    openPickerMenu(e, d, tile, choose, paint);
  };

  // Dwell to enlarge. A thumbnail is enough to tell an idle from a crouch and
  // not enough to judge a hand, so the bigger look is what you get for staying
  // still — no click to spend, and none to spend getting out of it either.
  // Delayed, or sweeping the grid on the way to one tile would flash the
  // preview over every tile in the path.
  tile.onmouseenter = (e) => {
    let x = e.clientX, y = e.clientY;
    tile.onmousemove = (m) => { x = m.clientX; y = m.clientY; };
    startDwell(() => openPickerPreview(d, x, y));
  };
  tile.onmouseleave = () => {
    tile.onmousemove = null;
    cancelDwell();
    closePickerPreview();
  };
  return tile;
}

export const DWELL_MS = 320;

export let dwellTimer = 0;

export function startDwell(fn) {
  cancelDwell();
  dwellTimer = setTimeout(fn, DWELL_MS);
}

export function cancelDwell() {
  clearTimeout(dwellTimer);
  dwellTimer = 0;
}

// -------------------------------------------------- the tile context menu
//
// Right-click asks about the DRAWING under the cursor rather than the pose in
// the panel, which is the only place that question can be asked of art the
// pose is not using — a bad alternate is invisible everywhere else.

export function closePickerMenu() {
  document.getElementById("pickerMenu")?.remove();
}

export function openPickerMenu(e, d, tile, choose, repaint) {
  closePickerMenu();
  const menu = document.createElement("div");
  menu.id = "pickerMenu";
  menu.className = "picker-menu";
  const doomed = d.option?.needsReplacement === "delete";
  // ANY DRAWING THE GAME IS NOT SHOWING can be thrown away; one it IS showing
  // cannot, whatever else the pose has banked beside it.
  //
  // The rule used to be "this pose has a spare to fall back to", which got
  // both ends wrong. A sheet cell no animation reaches has no spare and no
  // hole to leave — nothing draws it — and those are precisely the drawings
  // most likely to be junk, so the one delete that should always be allowed
  // was the one that never was. And a drawing in play WITH a spare was
  // offered, which leaves the game pointed at a file marked for deletion until
  // somebody remembers to repoint the pose. Pick the replacement first and the
  // old drawing becomes deletable by the same rule.
  const inUse = pickerDrawn.has(d.file);
  const items = doomed
    ? [["Restore this sprite", () => setDrawingDoomed(d, false, tile, repaint)]]
    : [
      ["Choose this sprite", choose],
      ["Delete this sprite", inUse ? null : () => setDrawingDoomed(d, true, tile, repaint),
       "the game draws this one — point the pose at another drawing first"],
    ];
  for (const [label, action, why] of items) {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !action;
    if (!action && why) b.title = why;
    b.onclick = () => { closePickerMenu(); action?.(); };
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - w - 8)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - h - 8)}px`;
  setTimeout(() => document.addEventListener("mousedown", onMenuOutside, true), 0);
}

export function onMenuOutside(e) {
  if (document.getElementById("pickerMenu")?.contains(e.target)) return;
  document.removeEventListener("mousedown", onMenuOutside, true);
  closePickerMenu();
}

/** Mark one drawing for deletion, or take the mark off.
 *
 *  The same tag the panel's "Delete variant" writes — a statement about an
 *  IMAGE, banked on its variant option, collected by the request tooling and
 *  exported through `variantPlacement`. Here it can be put on a drawing the
 *  pose is not using, which is where a bad alternate actually lives. */
export function setDrawingDoomed(d, doomed, tile, repaint) {
  if (!d.pose || !d.file) return;
  // Asked again here rather than trusted from the menu: this is the write, and
  // the one thing that must never happen is a delete tag on art the game is
  // showing.
  if (doomed && drawnFiles(state.char).has(d.file)) return;
  // Resolved from the manifest at the moment of writing, so the tag lands on
  // the drawing rather than on whatever object built the tile. Created if the
  // pose has never had options — a drawing nobody has ever compared against
  // anything still has to be refusable.
  const option = variantEntry(state.char, d.pose)?.options.find((o) => o.file === d.file)
    || (doomed ? ensureVariantOption(state.char, d.pose, d.file,
                                     d.label || (d.primary ? "Delivered" : null)) : null);
  if (!option) return;
  d.option = option;
  if (doomed) option.needsReplacement = "delete";
  else delete option.needsReplacement;
  variantFlagEdits.add(`${state.char}/${d.pose}`);
  remember(state.char, d.pose);
  tile.classList.toggle("doomed", doomed);
  repaint();
  onFlagChanged();
}

/** One tile's art, fetched if this character's set has not streamed in yet. */
export function drawTileSprite(cv, key) {
  const c = cv.getContext("2d");
  c.clearRect(0, 0, cv.width, cv.height);
  // The drawing the GAME uses, numbers and image both. On a pose with a
  // replacement waiting the two come from different places, and a tile that
  // measured one against the other cropped the art it was drawing.
  const meta = frameMeta(state.char, key);
  const img = frameImage(state.char, key);
  if (!meta || !img) {
    c.fillStyle = "rgba(154, 164, 192, 0.5)";
    c.font = "600 10px Inter, sans-serif";
    c.textAlign = "center";
    c.fillText(img ? "no data" : "loading…", cv.width / 2, cv.height / 2);
    if (!img) loadFrame(state.char, key).then((ok) => { if (ok) drawTileSprite(cv, key); });
    return;
  }
  // Fitted to the tile rather than drawn at game scale: these are for telling
  // poses apart, and a tall pose and a wide one should both fill the box.
  const pad = 10;
  const scale = Math.min((cv.width - pad * 2) / meta.w, (cv.height - pad * 2) / meta.h);
  c.drawImage(img, cv.width / 2 - (meta.w * scale) / 2, cv.height - pad - meta.h * scale,
              meta.w * scale, meta.h * scale);
}

/** Right-click preview: the same sprite, big enough to judge. */
export function openPickerPreview(d, clientX, clientY) {
  const box = $("pickerPreview");
  const cv = $("pickerPreviewCanvas");
  const meta = d.meta;
  const img = spriteFileImage(d.file)
    || (d.primary && d.pose ? frameImage(state.char, d.pose) : null);
  if (!meta) return;
  // A tile can be right-clicked before its art has streamed in; fetch it and
  // come back rather than doing nothing.
  if (!img) {
    loadSpriteFile(d.file).then((ok) => {
      if (ok && !$("spritePicker").hidden) openPickerPreview(d, clientX, clientY);
    });
    return;
  }
  const c = cv.getContext("2d");
  c.clearRect(0, 0, cv.width, cv.height);
  const pad = 16;
  const scale = Math.min((cv.width - pad * 2) / meta.w, (cv.height - pad * 2) / meta.h);
  c.drawImage(img, cv.width / 2 - (meta.w * scale) / 2, cv.height - pad - meta.h * scale,
              meta.w * scale, meta.h * scale);
  $("pickerPreviewLabel").innerHTML =
    `${d.caption ?? d.pose ?? ""}${d.label ? ` <i>${d.label}</i>` : ""} · ${meta.w}×${meta.h}`;
  box.hidden = false;
  // Kept on screen whichever corner it was opened from.
  const r = box.getBoundingClientRect();
  const x = Math.min(Math.max(8, clientX + 14), window.innerWidth - r.width - 8);
  const y = Math.min(Math.max(8, clientY - r.height / 2), window.innerHeight - r.height - 8);
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
}

export function closePickerPreview() {
  const box = $("pickerPreview");
  if (box) box.hidden = true;
}
