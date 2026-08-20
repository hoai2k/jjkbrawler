// WHAT LEAVES THE BENCH — the adjustment file.
//
// Everything edited here is a change to a manifest object the renderer is
// already reading, so the page shows the result immediately and nothing is
// saved. This is how it gets out: one JSON payload per touched character,
// carrying only what actually changed, for tools/apply_sprite_adjustments.py
// to write back into the repository.
//
// It is the last layer that is still about the sprites rather than about the
// panels, so it lives beside the model rather than inside the page: what is
// exported is a fact about the edits, not about how they were made.

import { spriteManifest, sharedFileOf } from "../../src/assets.js";
import {
  $, EDITABLE, KIND_FIELDS, BOOLEAN_FIELDS, TEXT_FIELDS, isOther, state,
} from "./bench_state.js";
import {
  updatesCleared, variantEntry, takeBanked, variantPicks, variantFlagEdits, rawMeta,
  headHeight, anchorsDirty, needsReplacement, dirtyFrames, approvalSettled,
  originalAnimFrames,
} from "./bench_model.js";

/** Actions re-pointed away from what the kit gives them, for the export. */
export function dirtyActions(charKey) {
  const out = {};
  const overrides = spriteManifest?.animOverrides?.[charKey] || {};
  for (const [name, frames] of Object.entries(overrides)) {
    const original = originalAnimFrames(charKey, name);
    if (!Array.isArray(frames) || !frames.length) continue;
    if (!original || frames.length !== original.length || frames.some((f, i) => f !== original[i])) {
      out[name] = frames;
    }
  }
  return out;
}

/** Poses of this character marked reviewed this session, as pose keys. */
export function clearedUpdates(charKey) {
  return [...updatesCleared]
    .map((id) => id.split("/"))
    .filter(([who]) => who === charKey)
    .map(([, pose]) => pose)
    .sort();
}

/** Every character this session may have something to export for. `originals`
 *  covers everything touched; a review tick is the one thing that can be
 *  recorded against a pose without editing it, so it joins in. */
export function editedChars() {
  return [...new Set([
    ...Object.keys(state.originals),
    ...[...updatesCleared].map((id) => id.split("/")[0]),
  ])];
}

/** One character's edits, or null if it has none. */
export function payloadFor(charKey) {
  const out = {};
  for (const key of dirtyFrames(charKey)) {
    const meta = rawMeta(charKey, key);
    const orig = state.originals[charKey][key];
    const entry = {};
    for (const f of EDITABLE) {
      const value = meta[f];
      const kindOf = KIND_FIELDS[f];
      if (kindOf) {
        // the VALUE is the kind, so a change of kind counts as a change; and
        // `false` is meaningful, clearing a request rather than leaving it
        const now = kindOf(meta);
        const was = kindOf(orig);
        if (now !== was) entry[f] = now ?? false;
        continue;
      }
      if (BOOLEAN_FIELDS.has(f)) {
        // `false` is meaningful, not "unset": it turns OFF a mirror that
        // `nativeLeft` would otherwise re-apply
        if (!!value !== !!orig[f]) entry[f] = !!value;
        continue;
      }
      if (TEXT_FIELDS.has(f)) {
        // "" is meaningful too — it clears a note rather than leaving the old
        // one standing, which matters when the flag it explains has changed.
        if ((value || "") !== (orig[f] || "")) entry[f] = value || "";
        continue;
      }
      if (!Number.isFinite(value)) continue;
      if (Math.abs(value - (orig[f] ?? 0)) > 1e-4) {
        // A tenth of a pixel is the right precision for a nudge and far too
        // coarse for the two fields that are not pixels: a scale needs four
        // places, and a fade measured in seconds over a 0–0.3 range has only
        // three usable steps at one. Each field gets the precision its UNIT
        // deserves rather than the one that suits most of them.
        const places = f === "renderScale" ? 4 : f === "fadeIn" ? 2 : 1;
        entry[f] = Number(value.toFixed(places));
      }
    }
    if (anchorsDirty(charKey, key) && meta.anchors) entry.anchors = meta.anchors;
    // The creature's attack box, when this session placed or moved one. An
    // object rather than a number, so it travels whole — four fractions that
    // only mean anything together.
    if (meta.attackBox && JSON.stringify(meta.attackBox) !== JSON.stringify(orig.attackBox)) {
      entry.attackBox = meta.attackBox;
    }
    // The hit region's own correction, likewise whole — an offset and a scale
    // that only mean anything together. `null` when it has been dragged back to
    // nothing, because clearing has to export as clearly as setting.
    if (JSON.stringify(meta.hit ?? null) !== JSON.stringify(orig.hit ?? null)) {
      entry.hit = meta.hit ?? null;
    }
    if (Object.keys(entry).length) {
      // WHICH DRAWING this tuning was measured against. A shared key resolves
      // to one fixed filename — `blood_orb.png` is always `blood_orb.png` — so
      // unlike a character pose, whose replacement lands under a new name, a
      // redelivered effect leaves no trace that the numbers beside it were
      // chosen for a picture that is gone. Naming the file is what lets the
      // apply tool fingerprint it and the checker notice later.
      const file = isOther(charKey) ? sharedFileOf(key) : null;
      if (file) entry.file = file;
      out[key] = entry;
    }
  }
  // Which drawing each pose should use, when that was changed this session.
  // Exported separately from the numbers because it is a different decision:
  // the placement that travels with it is banked onto the option itself.
  const picks = {};
  for (const [id, file] of variantPicks) {
    const [who, pose] = id.split("/");
    if (who === charKey) picks[pose] = file;
  }
  // A delete tag is banked the same way the numbers are: onto the option, by
  // file. Poses that only had a tag changed still need their options exported,
  // so they join `picks` for the placement pass without a selection change.
  const flagged = new Set();
  for (const id of variantFlagEdits) {
    const [who, pose] = id.split("/");
    if (who === charKey) flagged.add(pose);
  }

  const payload = { character: charKey };
  if (Object.keys(picks).length || flagged.size) {
    if (Object.keys(picks).length) payload.variantChoice = picks;
    const poses = new Set([...Object.keys(picks), ...flagged]);
    payload.variantPlacement = Object.fromEntries(
      [...poses].map((pose) => {
        const entry = variantEntry(charKey, pose);
        // The drawing on screen has its numbers on the POSE, not on its option
        // — they are banked when the pose switches away, which has not
        // happened if you are still looking at it. Bank them here too, or the
        // export would ship an option that forgets the tuning it was given.
        const showing = rawMeta(charKey, pose)?.file;
        return [pose, entry ? entry.options.map((o) => ({
          file: o.file,
          // Provenance, for an option this session created: which pose the
          // drawing was borrowed from, and the name the chevron shows.
          //
          // `borrowedFrom` is banked now (VARIANT_ORIGIN), so `takeBanked`
          // below carries it for every other option. It stays spelled out here
          // because the SHOWING option takes the pose's fields last, and a
          // pose pointed back at its own drawing correctly has no
          // `borrowedFrom` — the option's own record of where its drawing came
          // from should not be erased by that.
          ...(o.label ? { label: o.label } : {}),
          ...(o.borrowedFrom ? { borrowedFrom: o.borrowedFrom } : {}),
          ...takeBanked(o),
          ...(o.file === showing ? takeBanked(rawMeta(charKey, pose)) : {}),
          // Always present, so clearing a tag exports as clearly as setting one.
          needsReplacement: o.needsReplacement || false,
          // Same reason: approving a held-back replacement is the ABSENCE of
          // this flag, so it has to be stated rather than omitted.
          pending: !!o.pending,
        })) : []];
      }),
    );
  }
  const hh = headHeight(charKey);
  if (Math.abs(hh - (state.originalHeads[charKey] ?? hh)) > 1e-4) {
    payload.headHeight = Number(hh.toFixed(1));
  }
  if (Object.keys(out).length) payload.adjustments = out;
  // Poses whose new art turned out to need nothing. An adjusted pose leaves the
  // updated list on the strength of the adjustment, so only the untouched ones
  // have to be named here.
  const reviewed = clearedUpdates(charKey).filter((pose) => !out[pose]);
  if (reviewed.length) payload.clearUpdated = reviewed;
  // Which held-back replacements were let into the game, and which were sent
  // back. Separate from the numbers: not "this pose moved" but "this drawing is
  // the one the game uses from now on".
  const approvals = {};
  for (const [id, verdict] of approvalSettled) {
    const [who, pose] = id.split("/");
    if (who === charKey) approvals[pose] = verdict;
  }
  if (Object.keys(approvals).length) payload.approvals = approvals;
  const actions = dirtyActions(charKey);
  if (Object.keys(actions).length) payload.animOverrides = actions;
  // The pinned reference travels with the edit that caused it, or the applied
  // manifest would re-derive the span from the new idle and resize the set.
  // `charKey in`, not a `??` default: an unpinned character's baseline is
  // legitimately `undefined`, and defaulting would swallow the first real pin.
  // This says only "if no baseline was ever taken, do not guess" — which
  // remember() now makes unreachable, and which fails by omitting rather than
  // by inventing a change.
  const span = spriteManifest?.heightSpans?.[charKey];
  if (Number.isFinite(span) && (charKey in state.originalSpans)
      && span !== state.originalSpans[charKey]) {
    payload.heightSpan = span;
  }
  return (payload.headHeight !== undefined || payload.adjustments || payload.animOverrides
          || payload.heightSpan !== undefined || payload.variantPlacement
          || payload.clearUpdated) ? payload : null;
}

/** Everything edited this session, across every character.
 *
 *  A session usually walks the whole roster, so exporting only the character
 *  on screen loses the rest the moment you switch. `apply_sprite_adjustments.py`
 *  already accepts an array, so a multi-character export needs nothing new on
 *  the other end. A lone character still exports as a bare object. */
export function exportAll() {
  const json = pendingJson();
  const payloads = editedChars().sort().map(payloadFor).filter(Boolean);
  $("exportOut").value = json || "// no changes yet";
  if (json) downloadJson(json, exportFileName(payloads));
  lastExported = json;
}

/** Everything that would be exported right now, as the export's own JSON. */
function pendingJson() {
  const payloads = editedChars().sort().map(payloadFor).filter(Boolean);
  return payloads.length
    ? JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2)
    : "";
}

// What the last export contained, so "is there work that has not left the
// bench" can be answered exactly rather than guessed at from a dirty flag.
let lastExported = "";

/** Work done since the last export, or "" if the two agree.
 *
 *  NOTHING HERE IS SAVED. Every nudge and every review tick lives in memory on
 *  this page, by design --- the manifest is the repository's and an export is
 *  how a change reaches it. The cost is that a reload throws the lot away
 *  without a word, and a REVIEW TICK is the easiest thing to lose that way,
 *  because it leaves no mark on the canvas: you tick "done" on eight poses,
 *  the grid dims them, and nothing on screen distinguishes that from eight
 *  poses somebody already exported. Yaga's idle and two of Kashimo's came back
 *  a second time for exactly this reason.
 */
export function unexportedWork() {
  const json = pendingJson();
  return json === lastExported ? "" : json;
}

/** Named after what is in it, so a folder of exports is readable months later:
 *  `gojo-adjustments.json`, or `roster-adjustments.json` for a multi-character
 *  session. No timestamp — the file system already records that, and a name
 *  that changes every second cannot be overwritten in place. */
export function exportFileName(payloads) {
  const who = payloads.length === 1 ? payloads[0].character : "roster";
  return `${who}-adjustments.json`;
}

/** Save the export as a file rather than leaving it in the textarea to be
 *  selected and copied by hand. The textarea stays filled — reading the diff
 *  before sending it on is the normal thing to do. */
export function downloadJson(json, filename) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Freed on the next tick: revoking synchronously can beat the download in
  // some browsers and save an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
