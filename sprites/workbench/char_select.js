// The character dropdown, written once, for every bench that has one.
//
// Three benches under this directory each grew their own and they disagreed.
// The sprite bench sorted its fighters by the name on screen; the action bench
// listed them in ROSTER order, which is a fact about the select screen and
// means nothing in a dropdown — a dropdown is something you go to a known name
// in. Somebody looking for Nobara should find her in the same place on every
// bench, and that place is under N.
//
// Sorted by the DISPLAYED name rather than the key underneath it, because the
// two disagree often enough to matter: `toji` shows as "Toji Fushiguro" and
// `maki` as "Maki Zenin", so sorting keys would order the list by something the
// options do not say.

import { CHARACTERS, CHARACTER_KEYS, STAGED_CHARACTER_KEYS } from "../../src/characters.js";

/** A staged fighter says so. Their kit is wired and playable on a bench, but
 *  no player can pick them yet, and that is worth reading off the list rather
 *  than discovering when they are missing from character select. */
const STAGED_SUFFIX = " (not on the roster yet)";

export function isStaged(key) {
  return STAGED_CHARACTER_KEYS.includes(key);
}

/** What the dropdown calls this fighter. */
export function charLabel(key) {
  return (CHARACTERS[key]?.name || key) + (isStaged(key) ? STAGED_SUFFIX : "");
}

/** `keys`, alphabetically by the name each one shows. */
export function sortedCharKeys(keys = CHARACTER_KEYS) {
  return [...keys].sort((a, b) => charLabel(a).localeCompare(charLabel(b)));
}

/**
 * Fill a `<select>` with fighters, alphabetically.
 *
 * `keys`     which fighters to offer (defaults to the whole roster)
 * `selected` the value to land on, if it is in the list
 * `extras`   entries that are not fighters — `[value, label]` pairs, placed
 *            under a separator rule, the way the sprite bench keeps its shared
 *            art and work lists apart from the roster
 */
export function fillCharSelect(sel, { keys = CHARACTER_KEYS, selected = null, extras = [] } = {}) {
  sel.innerHTML = "";
  const add = (value, text) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    o.dataset.name = text;
    sel.appendChild(o);
  };
  for (const key of sortedCharKeys(keys)) add(key, charLabel(key));
  if (extras.length) {
    // A disabled option rather than an <hr>: it is the separator every browser
    // renders, and being unselectable it cannot be landed on by keyboard
    // either. Same rule the sprite bench's list follows.
    const rule = document.createElement("option");
    rule.disabled = true;
    rule.textContent = "──────────";
    sel.appendChild(rule);
    for (const [value, text] of extras) add(value, text);
  }
  if (selected && [...sel.options].some((o) => o.value === selected)) sel.value = selected;
  return sel;
}
