// Where each fighter's painted card is CROPPED — one number per character.
//
// The hero cards (assets/cards/<key>_card.jpg) are tall 640x820 paintings, and
// the UI shows them in eight differently-shaped holes: a 52px square beside the
// damage readout, a 44px square on the pause chip, the roster tile (anywhere
// from 3:4 to 2:1, whatever the window gives it), the matchup portrait on the
// select screen, the intro panel, the victory hero and its loser variant, and
// the victory card. Every one of those is `object-fit: cover`, so the browser
// scales the painting to fill and throws away the overflow — and what it throws
// away is decided by `object-position`.
//
// That used to be the keyword `top` everywhere, which is `50% 0%`: keep the top
// of the painting, crop off the bottom. It is the right answer for Gojo, whose
// head sits high against a night skyline, and the wrong one for Panda standing
// small in front of a shrine or Gakuganji seated with his guitar — a square
// crop of those is a chest, or a roof, rather than a face.
//
// A card's FOCUS is the POINT in the painting that should survive every crop,
// as percentages from its top-left corner. The height is the half that matters
// most — 0 is the top edge (what everything did before), 50 the middle, 100 the
// bottom — and the width matters wherever a hole is TALLER than the painting,
// which is where `cover` crops sideways instead: the intro panel on the four
// player VS splash is the tall one, and a figure standing off-centre in its
// painting walks out of frame there while every wide hole still looks right.
// The pair goes to CSS as `object-position: <x>% <y>%`, so a percentage here
// means exactly what it means there — align that point of the PAINTING with the
// same point of the HOLE — which is why one point works for holes of eight
// different shapes instead of needing one offset each.
//
// An entry is either a bare number (the height, with the width left at the
// centred 50% every card had before the point existed) or a `[x, y]` pair.
// Both forms are written by tools/apply_card_focus.mjs; the bare number stays
// so the common case — a card that only ever needed its height aimed — reads as
// the one number it is.
//
// AUTHORED IN THE WORKBENCH, not by eye in this file: /workbench/?edit=cards
// drags the line over the real painting and shows every one of those crops
// updating as it moves, at their real sizes. Export from there, then:
//   node tools/apply_card_focus.mjs <the-exported.json>
// rewrites the table below.
//
// THE PAINTINGS ONLY. assets/cards/simple/<key>_tile.jpg is a second art set —
// chest-up portraits drawn for the roster grid, framed for tile use already —
// and USE_SIMPLE_CARDS (config_menus.js) decides which set the grid draws. A
// focus tuned against a painting would be wrong for the matching tile, whose
// head sits somewhere else entirely, so the tiles are left top-cropped and this
// table means the paintings. If the simple set is ever switched on and wants
// tuning of its own, it wants its own table, not this one reinterpreted.
//
// An absent key means 0 — the old `top` behaviour, exactly — so this file being
// empty is the same game it was before the focus existed, and a card nobody has
// tuned is never worse than it was.

export const CARD_FOCUS = {
  yuji:       [56.9, 26.3], // Yuji
  nobara:     [57.5, 11.4], // Nobara
  megumi:     [55.6, 8.3],  // Megumi
  yuta:       9.8,          // Yuta
  maki:       [61.2, 2.3],  // Maki
  inumaki:    [59.6, 10.6], // Inumaki
  panda:      [55.7, 2.7],  // Panda
  mechamaru:  [53.9, 0.5],  // Mechamaru
  todo:       [36.7, 0.1],  // Todo
  momo:       [64, 9.5],    // Momo
  miwa:       [38, 0.2],    // Miwa
  kirara:     [40.6, 0],    // Kirara
  gojo:       [52.9, 7.8],  // Gojo
  nanami:     [65.1, 3.4],  // Nanami
  meimei:     [53.2, 7.6],  // Mei Mei
  gakuganji:  [45.7, 2.4],  // Gakuganji
  tengen:     [49.7, 59.7], // Tengen
  toji:       [60.7, 1.4],  // Toji
  yuki:       [59.4, 3.8],  // Yuki
  hakari:     0.2,          // Hakari
  uro:        [64.3, 38.3], // Uro
  reggie:     4.1,          // Reggie Star
  kashimo:    [65.4, 0],    // Kashimo
  naoya:      [55.1, 0],    // Naoya
  mahito:     [60.2, 0],    // Mahito
  jogo:       [72.3, 12.4], // Jogo
  hanami:     3.5,          // Hanami
  dagon:      [53.9, 6.1],  // Dagon
  kurourushi: [52.6, 6.6],  // Kurourushi
  haruta:     [25.1, 0.8],  // Haruta
  geto:       [42.6, 7],    // Geto
  choso:      [53.1, 19],   // Choso
  sukuna:     2.6,          // Sukuna
};

/** The crop focus for `key`: `{ x, y }` percentages from the painting's
 *  top-left corner. Untuned cards answer `{ x: 50, y: 0 }` — the centred,
 *  top-aligned crop the UI has always used. */
export function cardFocus(key) {
  const v = CARD_FOCUS[key];
  if (Array.isArray(v)) {
    return {
      x: Number.isFinite(v[0]) ? v[0] : 50,
      y: Number.isFinite(v[1]) ? v[1] : 0,
    };
  }
  return { x: 50, y: Number.isFinite(v) ? v : 0 };
}

/** Whether `key`'s focus is the untouched default, which is what decides
 *  whether the UI bothers emitting the custom properties at all. */
export function isDefaultFocus({ x, y }) {
  return x === 50 && y === 0;
}
