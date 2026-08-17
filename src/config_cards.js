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
// A card's FOCUS is the height in the painting that should survive every crop,
// as a percentage from its top edge: 0 is the top edge (what everything did
// before), 50 the middle, 100 the bottom. It goes to CSS as the y half of
// `object-position: 50% <focus>%`, so a percentage here means exactly what it
// means there — align that point of the PAINTING with the same point of the
// HOLE — which is why a single number works for holes of eight different
// shapes instead of needing one offset each.
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
  yuji:       26.3, // Yuji
  nobara:     11.4, // Nobara
  megumi:     8.3,  // Megumi
  yuta:       9.8,  // Yuta
  maki:       2.3,  // Maki
  inumaki:    10.6, // Inumaki
  panda:      2.7,  // Panda
  mechamaru:  0.5,  // Mechamaru
  momo:       9.5,  // Momo
  gojo:       7.8,  // Gojo
  nanami:     3.4,  // Nanami
  meimei:     7.6,  // Mei Mei
  gakuganji:  2.4,  // Gakuganji
  toji:       1.4,  // Toji
  yuki:       3.8,  // Yuki
  hakari:     0.2,  // Hakari
  uro:        38.3, // Uro
  reggie:     4.1,  // Reggie Star
  mahito:     0,    // Mahito
  jogo:       12.4, // Jogo
  hanami:     3.5,  // Hanami
  dagon:      6.1,  // Dagon
  kurourushi: 6.6,  // Kurourushi
  geto:       7,    // Geto
  choso:      19,   // Choso
  sukuna:     2.6,  // Sukuna
};

/** The crop focus for `key`, as a percentage from the painting's top edge.
 *  Untuned cards answer 0: the top-aligned crop the UI has always used. */
export function cardFocus(key) {
  const v = CARD_FOCUS[key];
  return Number.isFinite(v) ? v : 0;
}
