// The character dropdown, written once, for every bench that has one.
//
// Three benches under this directory each grew their own and they disagreed.
// The sprite bench sorted its fighters by the name on screen; the action bench
// listed them in ROSTER order, which is a fact about the select screen and
// means nothing in a dropdown — a dropdown is something you go to a known name
// in. Somebody looking for Nobara should find her in the same place on every
// bench, and that place is under N.
//
// The ORDER is not this module's decision. characters.js owns it — sorting a
// picker by `byCharacterName` rather than by CHARACTER_KEYS, which is a fact
// about the select screen grid and means nothing in a dropdown. This file just
// builds the <select>; if the roster ever sorts a different way, it sorts a
// different way here too, without this file being touched.

import { CHARACTERS, CHARACTER_KEYS, STAGED_CHARACTER_KEYS, characterName, byCharacterName } from "../../src/characters.js";

/** A staged fighter says so. Their kit is wired and playable on a bench, but
 *  no player can pick them yet, and that is worth reading off the list rather
 *  than discovering when they are missing from character select. */
const STAGED_SUFFIX = " (not on the roster yet)";

export function isStaged(key) {
  return STAGED_CHARACTER_KEYS.includes(key);
}

/** What the dropdown calls this fighter: the canonical name, plus the note if
 *  they are staged. The suffix is not part of the sort — a staged Nobara still
 *  belongs under N, not under N-plus-a-parenthesis. */
export function charLabel(key) {
  return characterName(key) + (isStaged(key) ? STAGED_SUFFIX : "");
}

/** `keys`, in the order characters.js says a picker puts fighters in. */
export function sortedCharKeys(keys = CHARACTER_KEYS) {
  return [...keys].sort(byCharacterName);
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
