# Image Requests — every image still to draw

**This is the one image-request document.** Every render mode's requests are
here, in their own section, whatever pipeline they feed. If you are drawing
or generating anything 2D for this project, this file is the list, and the
per-mode documents point here rather than keeping their own.

**It is generated** by `node tools/build_image_requests.mjs` from the
documents that author each round, plus the manifests and the files on disk.
Do not edit it; edit the source round and re-run. `--check` fails when it is
stale, and also when a source has an open round the tool did not recognise —
that second one is the guard, because a round written in an unexpected shape
is exactly how 172 images once went missing from this list.

**235 images outstanding.** Every one of them is listed below, with a full URL for anything you need to look at.

- **The sprite game** — 235 images: 222 asked for by rounds 24 and 25, plus [13 flagged in the workbench](#outstanding-by-manifest-not-by-request) as art that exists and is wrong
- **The live-3D anime path** — 0 images
- Separately, 20 poses are drawing another pose's file. Not counted above: those are substitutions somebody chose, not images anybody is owed.

## Rules that hold everywhere here

- **The canon reference is the subject.** A fighter's own `<char>_idle.png`
  at `https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/<char>_idle.png`
  carries their costume, proportions, palette,
  line weight and shading. The drawing is that character, not an
  interpretation of them.
- **The character block goes in the prompt verbatim.** All of them are at the
  bottom of this file.
- **Any subset is useful.** Everything here lands per fighter or per file, and
  anything undelivered keeps whatever the engine does today. Nothing in this
  file blocks play.
- **Every reference here is a full URL, and every OUTPUT path is relative.**
  That is the whole convention, and the two are never mixed. Anything you have
  to look at — a canon reference, the drawing being replaced, a brief, another
  document — is an `https://raw.githubusercontent.com/…` link you can fetch
  without a copy of the repository. Anything you have to NAME, like
  `kashimo/teeter.png`, is where the delivered file goes once somebody lands
  it in `assets/intake/`, and stays relative because you cannot write to a
  raw URL.

**The modes want opposite deliveries, and it is the one thing worth not
getting wrong.** Sprite rounds are keyed plates — flat magenta `#FF00FF` or
grey `#808080` screen, one subject, margin on all four sides, trimmed at
intake. The 3D inputs are the reverse: a turnaround wants clean white or
transparency, a swatch sheet wants labels, and nothing about them is keyed or
trimmed. Applying either mode's rules to the other produces a file its
pipeline cannot use. Each section states its own.

---

# The sprite game

Art for the game as a player sees it: `?render=sprite`, the default, and
the path all 27 fighters actually ship on. Keyed plates, delivered to
`assets/intake/`, trimmed and measured on import.

**235 images outstanding for this mode.** 222 asked for by rounds 24 and 25, authored in
[docs/asset-requests.md](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/docs/asset-requests.md) and reproduced whole below, and 13 flagged in the workbench and listed in [Outstanding by manifest, not by request](#outstanding-by-manifest-not-by-request).

- **25A** — The two aimed attacks (70 sprites)
- **25B** — The domain expansion sign (9 sprites)
- **24A** — The four throws (140 sprites)
- **24B** — Mahoraga's walk and teeter (3 sprites)

## 25A. The two aimed attacks — 70 sprites

**Two new pose keys per fighter, all 34 fighters and Mahoraga**:
`attack_diag_up_b` and `attack_air_diag_down_b`.

**What changed in the game, and what is missing.** A light attack thrown with
the stick on a diagonal is now aimed at that exact angle — the hitbox turns
with the stick and the drawn arc turns with the hitbox (`attackTilt` and
`swingMove` in `src/fighter.js`). The BODY did not. A fighter punching level
while the blow travels up at forty-five degrees is the game disagreeing with
itself on screen, and it is the two most-thrown diagonals that show it:
up-and-forward on the ground, down-and-forward in the air.

**Only the strike frame is bespoke.** Each of these plays the generic wind-up
the fighter already has and then its own strike — `attack_light_a` then
`attack_diag_up_b`, `attack_air_a` then `attack_air_diag_down_b` — which is
what makes this two drawings per fighter rather than four. Nothing waits on
them: until a fighter's frame lands, the state falls back to exactly the pair
they swing today (`diagUp` / `airDiagDown` in `src/characters.js`).

| Pose key | What it must read as | Drawing in the meantime |
|---|---|---|
| `attack_diag_up_b` | The STRIKE of a light attack thrown up-and-forward at about 45°, standing: the arm extended along that diagonal at full reach, shoulder turned into it, hips and back leg driving up through the line, chin following the fist. It is the same attack as `attack_light_b`, aimed up — same weapon, same hand, same commitment, forty-five degrees higher. | `attack_light_b` |
| `attack_air_diag_down_b` | The STRIKE of an aerial thrown down-and-forward at about 45°: the arm (or leg, if that is how this fighter's aerial lands) driven down the diagonal at full reach, body angled over it, the other arm trailing behind for counterweight. Airborne — no ground contact, legs not planted. It is `attack_air_b` aimed at the floor ahead. | `attack_air_b` |

**Continuity with the wind-up is the test.** These are second frames of a pair
whose first frame already exists, and they will be seen in sequence at 12 and 8
fps. The strike must be recognisably the same body, the same weight, the same
weapon and the same hand as the fighter's own `attack_light_a` /
`attack_air_a`, moved along the diagonal — not a different attack that happens
to point that way. Open the wind-up beside you while drawing it.

**The angle is about 45° and does not need to be exact.** The engine turns the
hitbox to the stick's own angle, which is anywhere from 12° to 62°; the drawing
is the fighter's reading of "up and forward", not a protractor.

Same spec as every sprite round: one subject per file, flat key screen (grey
for the warm-palette fighters — see the list at the top), facing right, one
zoom per character matched to their own `idle_a`, at least 600 px of body,
delivered to `assets/intake/<character>/<pose_key>.png`. Read
[pose-brief.md](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/docs/pose-brief.md) first, and the
[canonical reference](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/docs/asset-requests.md#the-canonical-reference-image--one-per-fighter) rule
applies as always.

| Fighter | Sprites | Idle to draw against |
|---|---|---|
| Yuji | `yuji/attack_diag_up_b.png`, `yuji/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuji/idle_a.png> |
| Nobara | `nobara/attack_diag_up_b.png`, `nobara/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/nobara/idle_a.png> |
| Megumi | `megumi/attack_diag_up_b.png`, `megumi/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/megumi/idle_a.png> |
| Yuta | `yuta/attack_diag_up_b.png`, `yuta/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuta/idle_a.png> |
| Maki | `maki/attack_diag_up_b.png`, `maki/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/maki/idle_a.png> |
| Inumaki | `inumaki/attack_diag_up_b.png`, `inumaki/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/inumaki/idle_a.png> |
| Panda | `panda/attack_diag_up_b.png`, `panda/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/panda/idle_a.png> |
| Mechamaru | `mechamaru/attack_diag_up_b.png`, `mechamaru/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/mechamaru/idle_a.png> |
| Todo | `todo/attack_diag_up_b.png`, `todo/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/todo/idle_a.png> |
| Momo | `momo/attack_diag_up_b.png`, `momo/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/momo/idle_a.png> |
| Miwa | `miwa/attack_diag_up_b.png`, `miwa/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/miwa/idle_a.png> |
| Kirara | `kirara/attack_diag_up_b.png`, `kirara/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kirara/idle_a.png> |
| Gojo | `gojo/attack_diag_up_b.png`, `gojo/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/gojo/idle_a.png> |
| Nanami | `nanami/attack_diag_up_b.png`, `nanami/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/nanami/idle_a.png> |
| Mei Mei | `meimei/attack_diag_up_b.png`, `meimei/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/meimei/idle_a.png> |
| Gakuganji | `gakuganji/attack_diag_up_b.png`, `gakuganji/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/gakuganji/idle_a.png> |
| Yaga | `yaga/attack_diag_up_b.png`, `yaga/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yaga/idle_a.png> |
| Tengen | `tengen/attack_diag_up_b.png`, `tengen/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/tengen/idle_a.png> |
| Toji | `toji/attack_diag_up_b.png`, `toji/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/toji/idle_a.png> |
| Yuki | `yuki/attack_diag_up_b.png`, `yuki/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuki/idle_a.png> |
| Hakari | `hakari/attack_diag_up_b.png`, `hakari/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/hakari/idle_a.png> |
| Uro | `uro/attack_diag_up_b.png`, `uro/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/uro/idle_a.png> |
| Reggie Star | `reggie/attack_diag_up_b.png`, `reggie/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/reggie/idle_a.png> |
| Kashimo | `kashimo/attack_diag_up_b.png`, `kashimo/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kashimo/idle_a.png> |
| Naoya | `naoya/attack_diag_up_b.png`, `naoya/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/naoya/idle_a.png> |
| Mahito | `mahito/attack_diag_up_b.png`, `mahito/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/mahito/idle_a.png> |
| Jogo | `jogo/attack_diag_up_b.png`, `jogo/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/idle_a.png> |
| Hanami | `hanami/attack_diag_up_b.png`, `hanami/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/hanami/idle_a.png> |
| Dagon | `dagon/attack_diag_up_b.png`, `dagon/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/dagon/idle_a.png> |
| Kurourushi | `kurourushi/attack_diag_up_b.png`, `kurourushi/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kurourushi/idle_a.png> |
| Haruta | `haruta/attack_diag_up_b.png`, `haruta/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/haruta/idle_a.png> |
| Geto | `geto/attack_diag_up_b.png`, `geto/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/geto/idle_a.png> |
| Choso | `choso/attack_diag_up_b.png`, `choso/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/choso/idle_a.png> |
| Sukuna | `sukuna/attack_diag_up_b.png`, `sukuna/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/sukuna/idle_a.png> |
| Mahoraga | `mahoraga/attack_diag_up_b.png`, `mahoraga/attack_air_diag_down_b.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/mahoraga/idle_a.png> |

## 25B. The domain expansion sign — 9 sprites

**One new pose key, `domain_expansion`, for the nine fighters who have a
domain** (`domains` in `src/characters.js`). Nobody else: a fighter without an
Expansion has nothing to open with it, and the pose would never be drawn.

**Nothing draws it yet.** This is the one request in either open round that is
art first and wiring second — the ultimate currently plays `ult_a`/`ult_b`
throughout, and the sign is the moment before that which the game has never
had. Delivered, it is one line of animation table to put in front of the ult.

**The pose.** In Jujutsu Kaisen the incantation is opened with a hand seal —
*shirushi*, a Buddhist **mudra** — held with both hands in front of the body,
and it is the one moment a sorcerer is drawn square to the viewer rather than
in profile. So this pose, alone among the set, **faces the camera**:

- Standing, feet planted about shoulder width, square to the viewer. Weight
  even. Still — this is the instant before the domain, not a lunge.
- Both hands raised in front of the chest or just below the chin, **fingers
  interlaced**, with one specific pair of fingers extended and pressed
  together, pointing up. That extended pair is what makes a mudra read as a
  mudra rather than as clasped hands, and it must be unambiguous at sprite
  size.
- Head level or tipped slightly down, eyes forward at the viewer. Expression
  is the character's own — Gojo's amusement, Sukuna's contempt, Jogo's
  fury — but the body is composed.
- No effects, no cursed energy, no domain behind them. The game draws all of
  that (`src/domains.js`); this is the figure only, on the flat key screen like
  every other sprite.

**Per fighter, the canon seal.** Each sorcerer's sign invokes a different
deity, and where the series names one it is worth drawing — the differences are
in which fingers extend and how the palms sit. Where it is not named, use the
general form above.

| Fighter | Domain | Sprite | Idle to draw against |
|---|---|---|---|
| Megumi | Chimera Shadow Garden | `megumi/domain_expansion.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/megumi/idle_a.png> |
| Yuta | Authentic Mutual Love | `yuta/domain_expansion.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuta/idle_a.png> |
| Gojo | Unlimited Void | `gojo/domain_expansion.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/gojo/idle_a.png> |
| Hakari | Idle Death Gamble | `hakari/domain_expansion.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/hakari/idle_a.png> |
| Naoya | Time Cell Moon Palace | `naoya/domain_expansion.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/naoya/idle_a.png> |
| Mahito | Self-Embodiment of Perfection | `mahito/domain_expansion.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/mahito/idle_a.png> |
| Jogo | Coffin of the Iron Mountain | `jogo/domain_expansion.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/idle_a.png> |
| Dagon | Horizon of the Captivating Skandha | `dagon/domain_expansion.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/dagon/idle_a.png> |
| Sukuna | Malevolent Shrine | `sukuna/domain_expansion.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/sukuna/idle_a.png> |

For reference on the general form: Itadori's is the **Kshitigarbha** mudra —
all fingers of both palms interlaced, turned inward, both middle fingers
straightened and pressed together — which is the clearest published
description of the shape and a good default for any of these where the canon
sign is not legible in the source
([Animehunch](https://animehunch.com/yuji-itadoris-domain-expansion-hand-sign/),
[Sportskeeda](https://www.sportskeeda.com/anime/all-13-jujutsu-kaisen-domain-expansion-hand-signs-meanings)).

**Facing is the one exception in this file.** Every other sprite is drawn
facing right and mirrored by the engine. This one is drawn front-on and must
not be mirrored: a mudra is not symmetric, and flipping it produces a hand
sign that does not exist. Delivered as `<character>/domain_expansion.png` like
the rest.

---

# Round 24 — open

**143 sprites: the last stand-ins.** Every pose on the roster is now either
drawn for the fighter who plays it or listed here. These are the ones a state
NAMES and nobody has drawn, so the game plays somebody else's drawing instead
— which is why none of this is urgent and all of it is visible.

The two groups are unrelated except in that respect: 24A is a mechanic the
whole roster owes four poses to, 24B is three poses one actor was never given.

## 24A. The four throws — 140 sprites

**Four new pose keys per fighter, all 34 fighters and Mahoraga**: `throw_fwd`,
`throw_back`, `throw_up`, `throw_down`.

**This reverses a decision, and says why.** Round 20C registered these four
keys and deliberately did not ask for them: each plays the heavy attack swung
that way, a throw IS a heave in that direction, and 20C was complete without
them. That reasoning still holds — nothing is broken today — but it was made
when the grab mechanic was new and behind a flag, and it leaves the roster in
the one state the request documents exist to prevent: a pose the game names,
nobody has drawn, and nobody has written down. Every other such pose has since
been drawn. These four are what is left.

**What a throw actually is on screen.** The victim is RELEASED the instant the
throw begins (`executeThrow` in `src/grab.js`) and launched by the hit in the
same frame. So the drawing is the FOLLOW-THROUGH of a heave with empty hands —
the thrower alone, having just let go. Do not draw an opponent, and do not
draw the moment of holding: that is `grab_hold`, which already exists.

| Pose key | What it must read as | Drawing in the meantime |
|---|---|---|
| `throw_fwd` | Just released a heave straight ahead: both arms extended forward at chest height, palms open, weight transferred fully onto the front foot, torso rotated through the throw, head following where they went. | `attack_heavy_a` |
| `throw_back` | Hurled someone behind them: torso twisted hard, both arms swept past the near hip and up toward the rear, head turned to look back over the shoulder. **The engine flips the fighter's facing at the end of this throw** (`executeThrow`), so draw the release, not the turn. | `attack_heavy_b` + `attack_heavy_a` |
| `throw_up` | Launched someone straight up: both arms thrown overhead, knees just snapping out of a dip, chest open, chin up, eyes following the rise. | `attack_up` |
| `throw_down` | Slammed someone into the floor: bent sharply at the waist, both arms driven down past the knees, back heel lifted, head down at the impact. | `attack_down` |

**All four are single drawings**, not `_a`/`_b` pairs — the state holds one
pose for `GRAB.throwDur` — so it is four files per fighter and no wind-up.

**The read to aim for is the DIRECTION, at a glance and in silhouette.** These
four poses are told apart by nothing else: same fighter, same costume, same
moment of a move, and the only thing a player needs off them is which way the
person who was just in their hands has gone. Arms and spine carry that; the
face does not.

Same spec as every sprite round: one subject per file, flat key screen (grey
for the warm-palette fighters — see the list at the top), facing right, one
zoom per character matched to their own `idle_a`, at least 600 px of body,
delivered to `assets/intake/<character>/<pose_key>.png`. Read
[pose-brief.md](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/docs/pose-brief.md) first, and the
[canonical reference](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/docs/asset-requests.md#the-canonical-reference-image--one-per-fighter) rule
applies as always.

| Fighter | Sprites | Idle to draw against |
|---|---|---|
| Yuji | `yuji/throw_fwd.png`, `yuji/throw_back.png`, `yuji/throw_up.png`, `yuji/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuji/idle_a.png> |
| Nobara | `nobara/throw_fwd.png`, `nobara/throw_back.png`, `nobara/throw_up.png`, `nobara/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/nobara/idle_a.png> |
| Megumi | `megumi/throw_fwd.png`, `megumi/throw_back.png`, `megumi/throw_up.png`, `megumi/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/megumi/idle_a.png> |
| Yuta | `yuta/throw_fwd.png`, `yuta/throw_back.png`, `yuta/throw_up.png`, `yuta/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuta/idle_a.png> |
| Maki | `maki/throw_fwd.png`, `maki/throw_back.png`, `maki/throw_up.png`, `maki/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/maki/idle_a.png> |
| Inumaki | `inumaki/throw_fwd.png`, `inumaki/throw_back.png`, `inumaki/throw_up.png`, `inumaki/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/inumaki/idle_a.png> |
| Panda | `panda/throw_fwd.png`, `panda/throw_back.png`, `panda/throw_up.png`, `panda/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/panda/idle_a.png> |
| Mechamaru | `mechamaru/throw_fwd.png`, `mechamaru/throw_back.png`, `mechamaru/throw_up.png`, `mechamaru/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/mechamaru/idle_a.png> |
| Todo | `todo/throw_fwd.png`, `todo/throw_back.png`, `todo/throw_up.png`, `todo/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/todo/idle_a.png> |
| Momo | `momo/throw_fwd.png`, `momo/throw_back.png`, `momo/throw_up.png`, `momo/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/momo/idle_a.png> |
| Miwa | `miwa/throw_fwd.png`, `miwa/throw_back.png`, `miwa/throw_up.png`, `miwa/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/miwa/idle_a.png> |
| Kirara | `kirara/throw_fwd.png`, `kirara/throw_back.png`, `kirara/throw_up.png`, `kirara/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kirara/idle_a.png> |
| Gojo | `gojo/throw_fwd.png`, `gojo/throw_back.png`, `gojo/throw_up.png`, `gojo/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/gojo/idle_a.png> |
| Nanami | `nanami/throw_fwd.png`, `nanami/throw_back.png`, `nanami/throw_up.png`, `nanami/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/nanami/idle_a.png> |
| Mei Mei | `meimei/throw_fwd.png`, `meimei/throw_back.png`, `meimei/throw_up.png`, `meimei/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/meimei/idle_a.png> |
| Gakuganji | `gakuganji/throw_fwd.png`, `gakuganji/throw_back.png`, `gakuganji/throw_up.png`, `gakuganji/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/gakuganji/idle_a.png> |
| Yaga | `yaga/throw_fwd.png`, `yaga/throw_back.png`, `yaga/throw_up.png`, `yaga/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yaga/idle_a.png> |
| Tengen | `tengen/throw_fwd.png`, `tengen/throw_back.png`, `tengen/throw_up.png`, `tengen/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/tengen/idle_a.png> |
| Toji | `toji/throw_fwd.png`, `toji/throw_back.png`, `toji/throw_up.png`, `toji/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/toji/idle_a.png> |
| Yuki | `yuki/throw_fwd.png`, `yuki/throw_back.png`, `yuki/throw_up.png`, `yuki/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuki/idle_a.png> |
| Hakari | `hakari/throw_fwd.png`, `hakari/throw_back.png`, `hakari/throw_up.png`, `hakari/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/hakari/idle_a.png> |
| Uro | `uro/throw_fwd.png`, `uro/throw_back.png`, `uro/throw_up.png`, `uro/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/uro/idle_a.png> |
| Reggie Star | `reggie/throw_fwd.png`, `reggie/throw_back.png`, `reggie/throw_up.png`, `reggie/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/reggie/idle_a.png> |
| Kashimo | `kashimo/throw_fwd.png`, `kashimo/throw_back.png`, `kashimo/throw_up.png`, `kashimo/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kashimo/idle_a.png> |
| Naoya | `naoya/throw_fwd.png`, `naoya/throw_back.png`, `naoya/throw_up.png`, `naoya/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/naoya/idle_a.png> |
| Mahito | `mahito/throw_fwd.png`, `mahito/throw_back.png`, `mahito/throw_up.png`, `mahito/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/mahito/idle_a.png> |
| Jogo | `jogo/throw_fwd.png`, `jogo/throw_back.png`, `jogo/throw_up.png`, `jogo/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/idle_a.png> |
| Hanami | `hanami/throw_fwd.png`, `hanami/throw_back.png`, `hanami/throw_up.png`, `hanami/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/hanami/idle_a.png> |
| Dagon | `dagon/throw_fwd.png`, `dagon/throw_back.png`, `dagon/throw_up.png`, `dagon/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/dagon/idle_a.png> |
| Kurourushi | `kurourushi/throw_fwd.png`, `kurourushi/throw_back.png`, `kurourushi/throw_up.png`, `kurourushi/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kurourushi/idle_a.png> |
| Haruta | `haruta/throw_fwd.png`, `haruta/throw_back.png`, `haruta/throw_up.png`, `haruta/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/haruta/idle_a.png> |
| Geto | `geto/throw_fwd.png`, `geto/throw_back.png`, `geto/throw_up.png`, `geto/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/geto/idle_a.png> |
| Choso | `choso/throw_fwd.png`, `choso/throw_back.png`, `choso/throw_up.png`, `choso/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/choso/idle_a.png> |
| Sukuna | `sukuna/throw_fwd.png`, `sukuna/throw_back.png`, `sukuna/throw_up.png`, `sukuna/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/sukuna/idle_a.png> |
| Mahoraga | `mahoraga/throw_fwd.png`, `mahoraga/throw_back.png`, `mahoraga/throw_up.png`, `mahoraga/throw_down.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/mahoraga/idle_a.png> |

## 24B. Mahoraga's walk and teeter — 3 sprites

**Three poses one actor never got**: `mahoraga/walk_a.png`,
`mahoraga/walk_b.png`, `mahoraga/teeter.png`.

Mahoraga is a transformation actor rather than a fighter — he owns a full
sprite set and has no kit — and the two roster-wide rounds that drew everybody
a walk cycle (round 11) and everybody a teeter (22A) both walked
`CHARACTER_KEYS`, which he is not in. So his walk plays his RUN cycle, four
frames of a sprint used for a stroll, and his teeter plays his idle.

`node tools/check_pose_coverage.mjs` did not catch it for the same reason the
rounds missed him: it asked the question of fighters only. It now asks it of
the actors too, which is what surfaced these three.

| Pose key | What it must read as | Drawing in the meantime |
|---|---|---|
| `walk_a` | Mid-stride at a WALK, not a run: one leg forward and planted, the other trailing, torso upright and level, arms swinging low and short. The contrast with his sprint is the whole point — the run is a charge, this is an approach. | `run_reach_a` |
| `walk_b` | The opposite half of the same cycle: the trailing leg has come through and planted, the other now trails. Same height, same posture — the two must match so the body does not bob between them. | `run_pass_a` |
| `teeter` | Balanced on the lip: weight shifted BACK from the drop, arms out, front foot at or just over the edge, head turned down toward the fall. The same brief 22A gave the roster, and the same test — it has to read against his own idle in silhouette. | `idle_a` + `idle_b` |

Same spec and same delivery as 24A. His idle to draw against:
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/mahoraga/idle_a.png>

---

# Round 20 — delivered

**All four requests are in.** The last of them was Yuji's own four poses, which
landed as [20E](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/docs/asset-requests-history.md#20e-yujis-four-round-20-poses--4-sprites) and are in the game:
his grab now reads as a grab and his dash attack as a lunge, like everybody
else's. Nothing in round 20 is outstanding.

- **~~44 of the 114 summon plates hold six creatures instead of one~~** —
  delivered. All forty-four came back as one figure each,
  `tools/check_summon_plates.py` passes on the whole tree of 114, and the seven
  authored hit boxes that were standing in for an unmeasurable plate came out
  with them.
- **~~Twenty backgrounds, re-extended from the paintings 18E replaced~~** —
  delivered, all twenty at 3200×1800, and in the game. Each one carries its
  source painting's composition rather than a fresh take on the brief, which is
  the whole thing 18E got wrong and the only thing this round was asking for.
  See [the history entry](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/docs/asset-requests-history.md#20b-twenty-backgrounds-re-extended--delivered).
- **~~The grab poses~~** and **~~the dash attack pose~~** — delivered, 26
  fighters of 27 each, plus Mahoraga. Both are in the game: every one is a new
  pose key, so nothing was replaced and nothing waited for an approval. A grab
  now reads as a grab and a dash attack as a lunge, on everybody except Yuji.
- **~~Yuji's four~~** — [20E](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/docs/asset-requests-history.md#20e-yujis-four-round-20-poses--4-sprites),
  delivered. 20C and 20D each asked for 27, one per fighter, and each arrived
  as 27 files with Mahoraga in Yuji's place; this was the correction, and it
  came back as the four missing drawings. Imported, anchored, and seeded a
  pose read each — the seeder had to learn that the REFERENCE character can
  gain frames too, since it was skipping him wholesale and he was then the one
  fighter with unread art.

Round 18 is closed and everything in it landed.

**Round 18 was delivered complete** — 28 sprites and 14 near-field cards, every
section of it, plus the five render3d image inputs (DI1–DI4). Its record, and
the reasoning behind each request in it, is now in
[the history](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/docs/asset-requests-history.md#round-18--delivered).

**Round 20 is the open round.** (19 is skipped as a request number: it was used
for the *intake* of round 18, so `assets/reference/round19/` holds the delivered
plates and no request ever carried that number. Reusing it would make "round 19"
mean two different things.) Anything found from here — a placement pass, an
approval rejection, a manifest audit — lands in 20 beside 20B.

---

# The live-3D anime path

2D images the `?render=3d` pipeline consumes: inputs that models are
GENERATED from, and textures the anime pass reads at runtime. They serve
`?render=billboard` too, which reads the same rigs. These are NOT keyed
plates — each round states its own delivery.

**0 images outstanding for this mode.** 0, authored in
[render3d/docs/image-requests.md](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/render3d/docs/image-requests.md) and reproduced whole below.

- **DI1** — model-generation turnaround boards (the Tripo inputs) (0 images)
- **DI2** — face sheets (the face-first gate's reference) (0 images)
- **DI3** — shade palette swatches (0 images)
- **DI4** — shared face textures (0 images)
- **DI5** — regeneration seeds (0 images)

## Round DI1 — model-generation turnaround boards (the Tripo inputs)

One board per fighter being modelled in the current D-round, sized for
image-to-3D seeding: **a single 2048×1024+ PNG, clean white or transparent
background**, containing the fighter in a neutral standing pose from
**front, 3/4-front, side, and back** at consistent scale and eye-line, flat
colors from the canon palette, **no dramatic lighting, no perspective, no
overlapping limbs** (arms slightly away from the body — near-A-pose reads
best for reconstruction). Face visible and on-model in the front view; the
back view must answer every question the sprites never had to (hair back,
uniform back, prop stowage).

A first-draft board can be composited from existing art:
`python tools/build_model_reference.py <char>` assembles the canon reference
plus the fighter's key sprites into a labelled board at
`render3d/docs/reference/<char>_board.png`. That composite is a brief for a
human or a seed for generation — **the request here is for the drawn
turnaround**, because sprites only ever show the one ¾ view and mirror the
rest, which is exactly what a 3D model cannot be built from.

**THE WHOLE FIGURE MUST FIT, WITH MARGIN.** Every view complete inside the
canvas — the crown of the head, any horns, hair or headgear, and the feet — with
clear white on all four sides. Twelve of the first twenty boards were refused
for exactly this: the figures were scaled to fill the frame and the tops of
their heads went off it, which on a model-generation seed is the one thing that
cannot be worked around. A smaller figure with air around it beats a large one
that is cut. `tools/import_render3d_images.py` measures this at import and
refuses a board whose head runs off the edge.

**Deliverable: 1 board per fighter.** Twelve are outstanding — the list is in
the refusal note above, and in
[docs/image-requests.md](#), which resolves it
against what is on disk.

### DI1: who is still owed one — 0 of 35

A fighter whose rig has already been delivered is NOT listed: a turnaround board's only job is to be the thing a model is generated from, and theirs exists.

**Nothing outstanding.** Every fighter has one.

## Round DI2 — face sheets (the face-first gate's reference)

AI-generated meshes fail at faces first (plan §9), and the workbench's
sweeping-light check needs something to judge AGAINST. Per fighter: one
sheet, front + ¾ + profile of the **head only**, at least 512px per view,
canon palette, neutral expression — the drawn truth of the jawline, the eye
shapes, the hair clumping and parting side. Hair clump direction matters:
the modeller combs the normals along it (D-spec addition 3).

**Deliverable: 1 sheet per fighter, same gating as DI1.**

### DI2: who is still owed one — 0 of 35

Listed for delivered rigs too — this is what the face-first review gate reads AGAINST, so it is wanted whether or not the model exists.

**Nothing outstanding.** Every fighter has one.

## Round DI3 — shade palette swatches

The two-band ramp paints shadows from a palette, not from darkness
(render3d/src/toon.js `shadeTint`, overridable per material). Per fighter:
one small swatch sheet pairing each major material region (skin, hair,
uniform top, uniform bottom, props) with its **lit fill and its painted
shadow color**, taken from or consistent with the fighter's own sprite
shading. This is a color decision, not a texture: the numbers land in the
.glb's material extras (or the manifest's `toon` block) at intake, and the
sheet is what review holds them against.

**Deliverable: 1 swatch sheet per fighter, same gating as DI1. Format free —
a labelled PNG grid is fine.**

### DI3: who is still owed one — 0 of 35

Listed for delivered rigs too: these numbers land in the rig's material extras at intake, and not one delivered rig carries a `toon` block today — all of them are running on engine defaults.

**Nothing outstanding.** Every fighter has one.

## Round DI4 — shared face textures *(one-time, roster-wide)*

The eyes-and-face rules (plan §4) run on small shared textures rather than
per-fighter art:

- `eye_highlight.png` — the camera-facing catchlight sprite: soft-edged
  white/near-white shapes on transparency, 128×128, one primary highlight +
  one small secondary. One texture serves the roster; per-fighter tinting is
  engine-side.
- `<char>_mouth_sheet.png` *(optional, per fighter, unblocking)* — a 4-cell
  strip (idle / hurt / ult-shout / win-grin) matching the fighter's face
  sheet style, 256×256 per cell, for the mouth texture-swap regions the
  D-spec lists in extras. No fighter ships blocked on this; the neutral
  modelled mouth is the default.

**Deliverable: 1 shared highlight texture now; mouth sheets ride whichever
D-round their fighter ships in.**

### DI4: who is still owed one — 0 of 35

The shared eye-highlight texture is delivered; these are the optional per-fighter mouth sheets. Nothing ships blocked on one.

**Nothing outstanding.** Every fighter has one.

## Round DI5 — regeneration seeds *(delivered — read the verdict before generating)*

**All nine landed and all nine pass**: five turnaround boards (`gakuganji`,
`maki`, `meimei`, `momo`, `uro`) and four weapon plates (everyone but Uro, who
carries none). The edge check refused nothing and warned about nothing — the
crowns, the hat tips and the feet are all inside the canvas with margin, which
is the fault that produced Mei Mei's horns.

Checked by eye against every rule below:

| | Verdict |
|---|---|
| Crown and feet in frame | **yes**, all five, with margin — Momo's hat tips included |
| Weapons out of the boards | **yes** — all four are drawn empty-handed |
| Weapon plates | **yes** — broom, polearm, axe, guitar, four views each, alone on white |
| Daylight between the legs | **yes** on Maki and Uro; Momo and Mei Mei stand closer but keep a gap; Gakuganji's legs are inside hakama at any pose |
| Hanging hair drawn along its length | **yes** — Mei Mei's braid reads as its own shape in the side and back views, which is what the chain extraction needs |

**Two notes to weigh before spending credits, neither a blocker:**

1. **Arms hang at the sides rather than in an A-pose.** DI1 asks for them
   slightly away from the body and these are closer than that — wrists near
   the hips on Maki, Momo and Mei Mei. The roster's existing models were
   generated from boards drawn the same way and their arms measure fine
   (0.80–0.99 balance for twenty of them), so this is a known-survivable
   deviation rather than a repeat of the fusion fault. It is also the most
   likely explanation for the three fighters that measure 0.55–0.71.

2. **Hands are relaxed-open, not curled.** The hand is a single bone and
   cannot close later, so a weapon joined to a flat palm reads as passing
   through it. Mei Mei's axe and Maki's polearm are the ones this shows on.
   Worth a redraw of the hands ONLY if the joined result looks wrong — which
   is now a thing that can be checked in an afternoon rather than guessed at,
   because the join is arithmetic.

**Uro's crown flag was partly the metric's fault.** Her board makes it plain
that the hair standing 29% of her stature above her head is her design, not
generated damage. Her legs at 55% of a normal leg still stand, and so does the
scale the Idle Review kept fighting.

### DI5: who is still owed one — 0 of 35

Named by MEASUREMENT, not by eye: tools/audit_model_health.py weighs the mesh bound to each limb against the roster's median and reports what cannot be true of a body. A fighter leaves this list when a replacement board lands — not when their model is regenerated, since regenerating from the same board is what produced the fault.

**Nothing outstanding.** Every fighter has one.

---

# The character blocks

Used **verbatim** as `[CHARACTER BLOCK]` in every prompt above — this is how
a fighter stays the same character across their sprites, their card and
their turnaround. Reproduced from
[asset-requests.md](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/docs/asset-requests.md#character-blocks), which owns them.

**Where the block and the canon reference disagree, the reference wins.**
Every fighter now has a `<char>_idle.png`, regenerated from their approved
idle, and it carries the figure scale, palette and shading the delivered set
actually has — which block text cannot. The wiki's (Anime) render answers
design questions the reference leaves open, and is where the blocks came
from: three were rewritten in round 9E because they described characters who
looked nothing like their anime designs, and Uro's again in round 18 after an
ambiguous sentence was drawn the wrong way twice.

| Key | Block |
|---|---|
| `yuji` | "Yuji Itadori from Jujutsu Kaisen, athletic teenage boy with short spiky salmon-pink hair and brown eyes, wearing a dark navy high-collared jujutsu school uniform jacket over a red hoodie, matching dark trousers and white sneakers" |
| `todo` | "Aoi Todo from Jujutsu Kaisen, very large muscular man with black hair in a short topknot and thick eyebrows, wearing a dark navy jacket over a maroon shirt with dark trousers" |
| `yuki` | "Yuki Tsukumo from Jujutsu Kaisen, tall athletic young woman with very long straight blonde hair falling past her waist with two tufts framing her face and brown eyes, wearing a sleeveless dark indigo mandarin-collar top with gold frog clasps at the shoulder, a grey buttoned corset belt at the waist, high-waisted light blue jeans and brown ankle boots" |
| `uro` | "Takako Uro from Jujutsu Kaisen, lean athletic woman with a fierce confident grin, pale violet-pink hair sweeping upward and outward in wild flame-like curling points, sharp violet eyes with heavy dark eyeliner, large gold cylindrical drop earrings, a black choker and a black band on each wrist, her only covering **two separate bands of pale-cyan cloud vapour with soft drifting edges — one wrapped across the chest, one at the hips — with the midriff BARE between them and never a single garment joining the two**, bare arms and legs, barefoot with violet-painted nails" |
| `mahito` | "Mahito from Jujutsu Kaisen, slim young man with pale blue-grey patchwork skin covered in stitched seams, long grey-blue hair in a loose bun, dark sleeveless vest and dark trousers" |
| `sukuna` | "Ryomen Sukuna the King of Curses from Jujutsu Kaisen, bare-chested muscular man with spiky salmon-pink hair, four eyes, black tattoo band markings across his face, chest and arms, dark loose trousers with a black sash" |
| `choso` | "Choso from Jujutsu Kaisen, pale serious young man with long black hair tied into two high loose buns with strands framing his face, a dark horizontal marking across the bridge of his nose, wearing a loose black robe-like tunic with pale trim, wide sleeves, dark trousers and simple shoes" |
| `hakari` | "Kinji Hakari from Jujutsu Kaisen, tall young man with slicked-back blond hair and an undercut, wearing a black school jacket hanging open over his bare chest, dark trousers" |
| `yuta` | "Yuta Okkotsu from Jujutsu Kaisen, slim young man with messy black hair, wearing an all-white long-sleeve school uniform with white trousers, a katana at his hip" |
| `nanami` | "Kento Nanami from Jujutsu Kaisen, tall blond man with a straight bob and tinted rectangular glasses, wearing a tan-beige suit with a patterned tie, carrying a blunt-tipped cleaver sword" |
| `toji` | "Toji Fushiguro from Jujutsu Kaisen, tall muscular man with short black hair and a vertical scar at the corner of his mouth, fitted black short-sleeve T-shirt and loose dark charcoal trousers with a dark sash" |
| `reggie` | "Reggie Star from Jujutsu Kaisen, tall lean man with straight shoulder-length blond hair parted at the side, heavy-lidded tired eyes and a narrow pointed chin beard, wearing a shaggy knee-length tunic and matching shoulder cape built from layered rows of torn white paper receipts with small pale mint-green printed tabs, bare arms and bare lower legs, barefoot" |
| `nobara` | "Nobara Kugisaki from Jujutsu Kaisen, young woman with short auburn-orange bob hair, navy school uniform dress with a belt, dark tights and brown boots, small hammer in hand" |
| `meimei` | "Mei Mei from Jujutsu Kaisen, tall elegant woman with very long silver-lavender hair worn in thick loose braids, calm confident expression, wearing a fitted black high-collared long-sleeved dress with gold buttons and dark tights, carrying a large single-headed battle axe" |
| `maki` | "Maki Zen'in from Jujutsu Kaisen, athletic young woman with dark green hair in a high ponytail and rectangular glasses, navy school uniform tunic over dark leggings, carrying a long naginata polearm" |
| `momo` | "Momo Nishimiya from Jujutsu Kaisen, petite young woman with shoulder-length auburn hair and a large dark witch hat, dark navy Kyoto uniform dress, riding or holding a wooden broom" |
| `gojo` | "Satoru Gojo from Jujutsu Kaisen, tall slim young man with spiky white hair and a black blindfold over his eyes, wearing a black high-collared jujutsu uniform with dark trousers and black boots" |
| `megumi` | "Megumi Fushiguro from Jujutsu Kaisen, young man with spiky black hair, wearing a dark navy high-collared jujutsu uniform with dark trousers and brown boots" |
| `inumaki` | "Toge Inumaki from Jujutsu Kaisen, slim young man with light grey-blond hair, wearing a dark navy high-collared school uniform zipped up over his mouth, white sneakers" |
| `mechamaru` | "Ultimate Mechamaru from Jujutsu Kaisen, a tall humanoid cursed-corpse puppet with a smooth clay-brown carved head, two round glowing green lens eyes and a small third lens on the forehead, a fixed grin of bared square teeth, a thick white puffy scarf around the neck, wearing a dark navy high-collared jujutsu uniform tunic with a white sash and very wide baggy navy trousers, bare carved wooden hands and bare wooden feet" |
| `gakuganji` | "Yoshinobu Gakuganji from Jujutsu Kaisen, stern hunched elderly man, bald on top with long straight white hair falling past his shoulders at the sides, a long thin white beard and drooping moustache, deeply wrinkled face with hooded eyes and gold hoop earrings, wearing a cream-white kimono top under a black band T-shirt with the kimono sleeves hanging loose, wide dark-purple hakama trousers, white tabi socks and wooden geta sandals, a crimson-red Flying-V electric guitar slung across his chest on a strap" |
| `geto` | "Suguru Geto from Jujutsu Kaisen, tall man with long black hair in a topknot, wearing a black traditional robe with gold trim over dark clothing" |
| `jogo` | "Jogo from Jujutsu Kaisen, a volcano-headed cursed spirit with a single large eye, cracked earthen skin, wearing a yellow-and-black spotted fur mantle over dark trousers" |
| `panda` | "Panda from Jujutsu Kaisen, a large anthropomorphic panda with black and white fur, muscular build, a small teal cursed-energy core visible on his shoulder" |
| `hanami` | "Hanami from Jujutsu Kaisen, tall powerfully built cursed spirit with a lean muscular pale bone-cream body marked by thick black brushstroke stripes down the face, arms, chest and abdomen, a rigid mask-like face with hollow black eye sockets, pale slit pupils and a wide fixed grin of large square teeth, a crown of thick tan antler horns curving up and back over the scalp, the entire right shoulder and arm wrapped in heavy white cloth bound close to the body with stitched seams where it meets the chest, a white cloth sash knotted at the waist with the ends hanging, wide baggy black hakama trousers gathered at the ankles, barefoot with broad clawed feet and long dark claws on both hands" |
| `dagon` | "Dagon from Jujutsu Kaisen, a tall broad hunched humanoid cursed spirit with deep red outer limbs and a tan inner chest and belly, a black midsection, a smooth red octopus-like head with blank pale eyes and a beard of thick red tentacles hanging from the jaw, black bat-like wings folded at the lower back, four heavy clawed fingers per hand and broad two-toed feet" |
| `kurourushi` | "Kurourushi from Jujutsu Kaisen, a tall cockroach cursed spirit draped head to floor in a smooth glossy black shroud, a maroon insect face with eight red-and-orange eyes in uneven pairs and a wide grin of human teeth behind layered jaws, six very long thin purple antennae sweeping out from the head, dark chitinous insect legs splayed out at the base of the shroud, wielding a long dark cursed sword with six firing barrels along its spine" |
| `mahoraga` | "Mahoraga from Jujutsu Kaisen, the Divine General shikigami — a towering pale-white humanoid with grey sculpted musculature, a long segmented tail, and a fanned crest of white blade-like spines sweeping back from his head. **A brass eight-spoked karma wheel is mounted on the headdress behind his skull, with a ball at the end of each spoke** — it is part of his head and turns with it. Bandaged wrap and beads at the throat, a torn dark charcoal skirt over a pale sash, purple-grey wraps at wrists and ankles, barefoot, carrying a long pale bone-textured sword" |
| `kashimo` | "Hajime Kashimo from Jujutsu Kaisen, tall lean young man with shaggy mint-green hair sticking out in tufts and two horn-like coiled locks rising from the top of his head, sharp green eyes with a short zig-zag lightning marking under each eye, wearing a loose all-white high-collared padded robe with puffed sleeves gathered at the elbow, white bandage wraps on both forearms, loose white trousers wrapped in white bandages from knee to ankle, pale grey ankle boots, carrying a long red staff with gold caps and a gold ball finial" |
| `yaga` | "Masamichi Yaga from Jujutsu Kaisen, tall broad heavily built middle-aged man with tan skin, dark brown hair in a short spiked crop with shaved sides, a chinstrap beard and moustache, small dark oval sunglasses always covering his eyes, wearing a plain black zip-up high-collared jacket, black trousers and black dress shoes" |
| `naoya` | "Naoya Zen'in from Jujutsu Kaisen, tall slim young man with short olive-blond hair with darker roots swept to one side, narrow brown eyes and a permanent smug smirk, small earrings on his left ear, wearing a white band-collar shirt under a dark teal kimono jacket, a pale grey pleated hakama tied at the waist, dark tabi socks and zōri sandals" |
| `kirara` | "Kirara Hoshi from Jujutsu Kaisen, a slender young person with long black hair past the shoulders, blunt-cut bangs with the right section dyed cyan and two flat face-framing strands, large purple eyes with yellow star-shaped pupils, two beauty marks by the mouth, a black studded choker, an off-shoulder cream ribbed crop top over magenta camisole straps with a bare midriff, a doubled red-brown belt with a gold star buckle, black flared trousers cropped above the ankle, magenta socks and black lace-up ankle boots, black painted nails" |
| `haruta` | "Haruta Shigemo from Jujutsu Kaisen, a short lean young man with slicked blond hair pulled into a long side ponytail tied on the left, thin eyebrows, drooping purple eyes with a lilac teardrop marking under each eye, a faint smug pout, bare-chested under a black one-shoulder jumpsuit with loose trousers gathered at the calves, a pale lilac glove on his sword hand, brown loafers worn barefoot, carrying a single-edged sword whose hilt is a sculpted human hand" |
| `tengen` | "Master Tengen from Jujutsu Kaisen, an inhuman robed figure with a tall smooth cylindrical hairless head, four narrow eyes stacked in two pairs down the face, a small stern mouth, pale grey-white skin, draped floor-length grey-white layered robes with a cowled folded neck and wide sleeves, long-fingered pale hands held open at the sides, bare feet with long toes" |
| `miwa` | "Kasumi Miwa from Jujutsu Kaisen, a young woman with long light-blue hair falling past her shoulders with blunt bangs, dark blue eyes and an earnest expression, wearing the dark navy Kyoto Jujutsu High uniform — a fitted suit-style jacket over a white collared shirt and navy tie, matching navy trousers, brown loafers — with a katana in a brown scabbard at her hip" |

---

# Outstanding by manifest, not by request

The other half of the question, and a narrower one: poses whose art EXISTS
and is wrong. A workbench flag says so directly; a pose drawing a file that
is not its own says so silently, which is how seven of them stayed invisible
until round 18G. Neither can see a pose that was never drawn — that is what
the rounds above are for.

**13 flagged, 20 drawing somebody else's art** (they overlap: a flagged pose can also be one).

| Fighter | Pose | Why | What is wrong | The drawing now | Canon reference |
|---|---|---|---|---|---|
| Mei Mei | `attack_air_diag_down_b` | quality | She doesn't have 3 braids, only 2 | [attack_air_diag_down_b.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/meimei/attack_air_diag_down_b.png) | [meimei_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/meimei_idle.png) |
| Takako Uro | `attack_heavy_b` | quality | Costume should be more canonical, but also no smoke coming out of her hand, but do keep the strongly attacking pose with arm extended fully in an attack toward the right. | [attack_heavy_b.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/uro/attack_heavy_b.png) | [uro_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/uro_idle.png) |
| Jogo | `attack_up` | pose | We need a sprite with Jogo attacking directly upward. | [ledge_hang.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/ledge_hang.png) — `ledge_hang`'s drawing, not `attack_up`'s | [jogo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/jogo_idle.png) |
| Takako Uro | `crouch_attack_b` | pose | Should be crouching and leaning rightward, stretching out her leg in a sweep attack rightward at full extension. (but not stretching out her arm, which should be supporting the motion from nearer to the body) | [attack_dash.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/uro/attack_dash.png) — `attack_dash`'s drawing, not `crouch_attack_b`'s | [uro_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/uro_idle.png) |
| Jogo | `attack_down` | delete | — | [r2c2.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/r2c2.png) | [jogo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/jogo_idle.png) |
| Jogo | `attack_light_a` | delete | — | [r2c0.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/r2c0.png) | [jogo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/jogo_idle.png) |
| Jogo | `attack_light_a` | delete | — | [r0c3.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/r0c3.png) | [jogo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/jogo_idle.png) |
| Jogo | `crouch_a` | delete | — | [r4c0.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/r4c0.png) | [jogo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/jogo_idle.png) |
| Jogo | `crouch_a` | delete | — | [r4c1.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/r4c1.png) | [jogo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/jogo_idle.png) |
| Jogo | `crouch_attack_a` | delete | — | [r4c2.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/r4c2.png) | [jogo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/jogo_idle.png) |
| Jogo | `crouch_attack_a` | delete | — | [r4c3.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/r4c3.png) | [jogo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/jogo_idle.png) |
| Jogo | `dash` | delete | — | [r1c2.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/r1c2.png) | [jogo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/jogo_idle.png) |
| Jogo | `ult_a` | delete | — | [r3c2.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/jogo/r3c2.png) | [jogo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/jogo_idle.png) |
| Satoru Gojo | `attack_light_a` | drawing another pose's file | it is `attack_heavy_a`, not `attack_light_a` | [attack_heavy_a.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/gojo/attack_heavy_a.png) | [gojo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/gojo_idle.png) |
| Hanami | `attack_light_b` | drawing another pose's file | it is `special_neutral`, not `attack_light_b` | [special_neutral.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/hanami/special_neutral.png) | [hanami_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/hanami_idle.png) |
| Suguru Geto | `attack_light_b` | drawing another pose's file | it is `attack_dash`, not `attack_light_b` | [attack_dash.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/geto/attack_dash.png) | [geto_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/geto_idle.png) |
| Ryomen Sukuna | `attack_light_b` | drawing another pose's file | it is `r3c0`, not `attack_light_b` | [r3c0.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/sukuna/r3c0.png) | [sukuna_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/sukuna_idle.png) |
| Yuta Okkotsu | `attack_heavy_b` | drawing another pose's file | it is `attack_dash`, not `attack_heavy_b` | [attack_dash.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuta/attack_dash.png) | [yuta_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/yuta_idle.png) |
| Yuta Okkotsu | `attack_light_a` | drawing another pose's file | it is `attack_air_a`, not `attack_light_a` | [attack_air_a.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuta/attack_air_a.png) | [yuta_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/yuta_idle.png) |
| Yuta Okkotsu | `attack_light_b` | drawing another pose's file | it is `attack_air_b`, not `attack_light_b` | [attack_air_b.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuta/attack_air_b.png) | [yuta_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/yuta_idle.png) |
| Nobara Kugisaki | `crouch_attack_b` | drawing another pose's file | it is `attack_dash`, not `crouch_attack_b` | [attack_dash.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/nobara/attack_dash.png) | [nobara_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/nobara_idle.png) |
| Maki Zen'in | `attack_light_b` | drawing another pose's file | it is `special_side`, not `attack_light_b` | [r3c0.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/maki/r3c0.png) | [maki_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/maki_idle.png) |
| Panda | `attack_light_a` | drawing another pose's file | it is `r0c2`, not `attack_light_a` | [r0c2.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/panda/r0c2.png) | [panda_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/panda_idle.png) |
| Panda | `crouch_attack_a` | drawing another pose's file | it is `crouch_a`, not `crouch_attack_a` | [r4c1.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/panda/r4c1.png) | [panda_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/panda_idle.png) |
| Aoi Todo | `attack_heavy_b` | drawing another pose's file | it is `attack_dash`, not `attack_heavy_b` | [attack_dash.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/todo/attack_dash.png) | [todo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/todo_idle.png) |
| Aoi Todo | `attack_light_b` | drawing another pose's file | it is `attack_heavy_b`, not `attack_light_b` | [special_side.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/todo/special_side.png) | [todo_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/todo_idle.png) |
| Takako Uro | `attack_air_a` | drawing another pose's file | it is `attack_air`, not `attack_air_a` | [attack_air.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/uro/attack_air.png) | [uro_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/uro_idle.png) |
| Yuji Itadori | `attack_light_a` | drawing another pose's file | it is `guard`, not `attack_light_a` | [guard.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yuji/guard.png) | [yuji_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/yuji_idle.png) |
| Yoshinobu Gakuganji | `crouch_attack_b` | drawing another pose's file | it is `attack_dash`, not `crouch_attack_b` | [attack_dash.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/gakuganji/attack_dash.png) | [gakuganji_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/gakuganji_idle.png) |
| Mahoraga | `crouch_attack_b` | drawing another pose's file | it is `attack_dash`, not `crouch_attack_b` | [attack_dash.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/mahoraga/attack_dash.png) | [mahoraga_canon.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/mahoraga_canon.png) |
| Naoya Zen'in | `attack_heavy_a` | drawing another pose's file | it is `run_pass_a`, not `attack_heavy_a` | [run_pass_a.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/naoya/run_pass_a.png) | [naoya_idle.png](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/naoya_idle.png) |

Separately, **2 improvement requests** — the art works and is just
not as good as it should be. Nothing is blocked by one, and the standing
ones are alpha fixes to delivered files, which is repo work rather than a
request.
