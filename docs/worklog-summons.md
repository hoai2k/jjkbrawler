# Worklog — Summoning system (in progress)

Session context doc: if this session is cut off, everything needed to resume
is here. Delete this file once the feature is merged and verified.

## The task (user request, 2026-08-07)

> Implement or reimplement a summoning system, for characters like Megumi to
> summon his Shikigami, but also for Geto to summon curses, and for Mahito to
> summon cursed humans, and Toji etc. If there are any missing sprites, then
> add those to an asset request doc with prompts for me to generate them.
> Sync to main before starting and merge to main when done.

## Current repo state

- Branch flow: develop on `claude/image-work-cloud-local-o9wnwy`, merge to
  `main` when done (user has standing instruction to merge). `main` deploys to
  GitHub Pages via `.github/workflows/deploy-pages.yml` →
  https://hoai2k.github.io/jjkbrawler/
- Started from `main` @ 2e95e1f (Random fighter option). Synced before work.

## Design

New module `src/summons.js`: persistent autonomous ally minions, distinct from
projectiles (fire-and-forget) and the bespoke Mahoraga ultimate entity.

A summon is an entity in `state.entities` with:
- **Targeting**: nearest living non-owner fighter (FFA-safe).
- **Behaviors**:
  - `chaser` — grounded; runs at target, lunge-bites with per-target hit
    cooldown (Megumi's Divine Dogs, Geto's Rainbow Dragon).
  - `bomber` — chases and detonates on contact, dying (Mahito's transfigured
    human).
  - `support` — hovers behind/above its owner and periodically fires a
    projectile at the target (Toji's Inventory Curse spitting cursed tools).
- **Lifetime**-limited, **capped** per owner+summon id (recast replaces the
  oldest). Summons die with their owner's elimination and are cleared by
  match reset (state.entities is already cleared in resetMatch).
- **Sprites**: config lists preferred sprite keys in order; first loaded image
  wins. This lets placeholder art ship now and real art drop in later with no
  code change (`summon:*` keys are attempted at load; missing files are
  tolerated quietly).

### Kit changes (one special per character becomes type "summon")

| Char | Slot | Before | After |
|---|---|---|---|
| Megumi | side | Divine Dogs (wave projectiles) | Summons both dogs as persistent chasers (existing sprites `summon:divineDogWhite/Black`) |
| Geto | side | Rainbow Dragon (wave projectile) | Persistent chaser (existing sprite `effect:curse_dragon`) |
| Mahito | down | Soul Isomer (slow projectile) | Bomber summon "Transfigured Human" (placeholder `effect:soul_isomer`; wants `summon:transfigured_human`) |
| Toji | down | Serpent Feint | Support summon "Inventory Curse" (placeholder `effect:cursed_spirit_orb`; wants `summon:inventory_curse`), hurls cursed-tool projectiles (`effect:cursed_tool`) |

Untouched on purpose: Megumi's Nue (dive projectile is iconic as-is), Geto's
volley + Kuchisake trap, Mahoraga ultimate (bespoke adaptation entity),
Yuta's Rika (install/echo). `grantSummonMeter` passives (tenShadows,
curseHoard) apply to summon casts.

## Checklist

- [x] Sync main
- [x] Survey existing code (specials/ultimates/combat/assets/render)
- [x] `src/summons.js` — spawnSummon + behaviors + cap + draw
- [x] `specials.js` — `summon` handler wired to spawnSummon
- [x] `characters.js` — 4 kit edits above
- [x] `assets.js` — optional summon sprite keys (quiet-missing)
- [x] Asset request doc entries with generation prompts
      (`docs/asset-requests.md`, Round 7 section)
- [x] `docs/characters.md` updated for the four changed moves
- [x] Test: all four characters spawn/attack/expire cleanly against an
      AI-disabled dummy; no console errors. (Testing tip learned the hard
      way: release the direction key ~300ms AFTER the special button, or the
      buffered action resolves with dirX=0 and casts the neutral slot.)
- [x] Commit branch, merge to main, verify Pages deploy

## Status: COMPLETE — feature merged. This doc can be deleted next session.

## Testing notes

Local server: `npm start` → http://127.0.0.1:5174. Headless scripts live in
the session scratchpad (pattern: launch chromium at /opt/pw-browsers/chromium,
click through select → stage → drive keys, watch console errors). CPU fights
back; to force specials for a specific character, select them for P1 and press
L (special) with direction held.
