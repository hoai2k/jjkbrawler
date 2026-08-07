# JJK Brawler II — Character Research & Design

How each fighter's canon abilities and personality from *Jujutsu Kaisen* were
translated into stats, specials, ultimates, and passives. Numbers live in
`src/characters.js`; this document explains **why** each kit is the way it is.

**Reading a kit:** every character has universal lights/heavies (same inputs,
different reach/speed/damage/effects), three specials (neutral, side, down),
one meter-funded ultimate, and one always-on passive. Stats shown as
*speed / weight* where speed is ground px/s and weight divides knockback
(higher = harder to launch).

Research sources: the series itself plus the
[Jujutsu Kaisen Wiki](https://jujutsu-kaisen.fandom.com/) (see the References
section at the bottom).

---

## Satoru Gojo — "The Honored One"
**Canon:** The strongest sorcerer alive. The Limitless technique manipulates
space at infinity — attacks simply never arrive (Infinity), while Blue
(attraction), Red (repulsion), and Hollow Purple (their fusion — erasure) weaponize
it. Six Eyes gives him perfect information. Personality: playful, arrogant,
untouchable — and backs every bit of it up.

**Design mapping:** Fastest all-rounder in the game but the second-lightest —
he wins by *not being touched*, and when you finally do tag him, he goes flying.
His whole kit is about control of space.
- *Stats:* 468 speed / 0.92 weight — top-tier mobility, glass frame.
- **Lapse: Blue** (neutral): a slow attraction core that **drags the opponent
  toward it** before popping — sets up combos and ruins retreats.
- **Reversal: Red** (side): repulsion — modest damage, brutal knockback, and it
  **deletes enemy projectiles** along its path.
- **Infinity** (down): a counter stance. The next attack "stops before it
  reaches him" — nullified and answered automatically.
- **Ultimate — Hollow Technique: Purple:** a massive erasing mass that crosses
  the entire stage, unblockable. The screen-clearing statement piece.
- *Passive — Infinity:* his shield takes 45% less damage; chip-outs don't work
  on the Limitless.

## Yuta Okkotsu — "Rika's Beloved"
**Canon:** Special-grade student haunted by (and devoted to) Rika, the Queen of
Curses; an enormous cursed-energy pool, refined swordsmanship, Reverse Cursed
Technique healing, and full Rika manifestation. Personality: gentle and
self-sacrificing until someone he loves is threatened — then terrifying.

**Design mapping:** The honest all-rounder with a guardian angel. Clean sword
buttons, one of the game's only heals, and a love-powered comeback engine.
- *Stats:* 402 / 1.02 — textbook midweight.
- **Cursed Energy Slash** (neutral): sword-beam projectile.
- **Rika's Claw** (side): Rika rakes a huge box in front of him — big, delayed,
  scary.
- **Reverse Cursed Technique** (down): channel to heal ~9%/s for 1.4 s —
  interruptible, so it's a spacing reward.
- **Ultimate — Full Manifestation: Rika:** for 9 s Rika **echoes every melee
  hit** with bonus damage of her own.
- *Passive — Bond of Love:* past 100% damage his damage rises 12% — he gets
  scarier as he's cornered, exactly like the Shibuya novel fight.

## Kinji Hakari — "The Gambler"
**Canon:** Suspended student who runs an illegal fight club; his domain, Idle
Death Gamble, is a pachinko parlor — hitting the jackpot grants **4 minutes 11
seconds of infinite cursed energy**, with reflexive Reverse Cursed Technique
making him effectively immortal for the duration. Personality: thrill-addict,
mouthy, thrives on momentum and risk.

**Design mapping:** A brawler whose entire game plan is *getting to jackpot*.
- *Stats:* 415 / 1.08 — sturdy rush frame.
- **Rough Energy Shutter** (neutral): slams a piercing shutter-door wave.
- **Restless Rush** (side): advancing multi-hit flurry.
- **Reserve Balance** (down): **spin the reels** — random heal, meter, damage
  buff, or a dud. Pure Hakari.
- **Ultimate — JACKPOT:** 8 s install: constant healing, hyper-armor (no
  hitstun), +damage, +speed. He does not stop coming.
- *Passive — Gambler's Flow:* builds ultimate meter 30% faster than anyone
  else. The house always reaches jackpot eventually.

## Maki Zen'in — "Heavenly Restricted"
**Canon:** Born with a Heavenly Restriction — no cursed energy at all, traded
for superhuman physique (eventually Toji-tier). Fights with cursed tools:
Playful Cloud, the Dragon-Bone sword, the Split Soul Katana that cuts the soul
directly. Personality: defiant, disciplined, driven to overthrow the clan that
called her worthless.

**Design mapping:** Pure rushdown with zero magic and maximum steel — the
anti-defense character. If they hide in shield, Maki is the answer.
- *Stats:* 452 / 1.00 — second-fastest, real weapons give her the longest
  normal reach.
- Her lights and heavies all carry **weaponBreak** (+18 flat shield damage);
  her side special multiplies that.
- **Cursed Tool Toss** (neutral): her only "projectile" — she throws hardware.
- **Playful Cloud** (side): invincible-startup three-section-staff rush with a
  3× shield multiplier — a guard-break on a stick.
- **Split Soul Stance** (down): 3.2 s where her attacks **ignore shields
  entirely** — the katana cuts the soul, not the guard.
- **Ultimate — Heavenly Restriction: Awakening:** the night the Zen'in clan
  ended, as an install: +35% speed, +30% damage for 8 s.
- *Passive — Heavenly Restriction:* immune to burn/snare/soul-mark/cursed
  speech. A body without cursed energy can't be cursed.

## Megumi Fushiguro — "Ten Shadows"
**Canon:** Zen'in-blooded user of the Ten Shadows technique — shikigami
summoned from shadow: Divine Dogs, Nue, the Great Serpent, toads, and at the
apex the never-tamed Mahoraga, the wheel-crowned general that **adapts to any
phenomenon**. Personality: reserved, tactical, self-sacrificing to a fault
("I'll save people unfairly").

**Design mapping:** Mid-range tactician — his shikigami fight so he doesn't
have to.
- *Stats:* 418 / 0.96 — nimble but light.
- **Nue** (neutral): diving shadow-bird arc that **paralyzes** (snare).
- **Divine Dogs** (side): summons both wolves as persistent hunters that
  chase and bite for six seconds — his shikigami fight beside him.
- **Shadow Sink** (down): melts into his own shadow, teleporting through
  danger (an invincible reposition).
- **Ultimate — Mahoraga:** the full ritual. The general stalks the stage for
  8 s, smashing whatever it reaches, while Megumi takes reduced damage behind
  it. (He summoned it; you deal with it.)
- *Passive — Ten Shadows:* summon specials refund extra ultimate meter.

## Nobara Kugisaki — "Straw Doll Sorceress"
**Canon:** Straw Doll Technique: cursed nails driven by hammer, **Hairpin**
detonating planted nails, and **Resonance** channeling damage through a straw
doll into anything marked by her nails — range means nothing. Personality:
loud, vain, utterly fearless; "I love me."

**Design mapping:** The mark-economy zoner. Every nail that lands is money in
the bank; her specials decide when to cash out.
- *Stats:* 400 / 0.98.
- Her lights and heavies plant **nail marks** (up to 6 with her passive).
- **Nail Shot** (neutral): twin nail projectiles — the mark applicator.
- **Hairpin** (side): detonates *all* marks — damage and knockback scale with
  the count. Six-mark Hairpin is a KO.
- **Resonance** (down): unblockable soul damage to a marked target **anywhere
  on screen** — punishes runaways; keeps half the marks.
- **Ultimate — Deluxe Resonance:** a storm of nails from every direction, then
  a full-power resonance ritual finisher.
- *Passive — Straw Doll Technique:* marks last twice as long, stack twice as
  high.

## Toge Inumaki — "Cursed Speech User"
**Canon:** Inherited Cursed Speech — spoken commands the world must obey:
"Don't move," "Blast away," "Get crushed," "Sleep." Overuse tears his throat
(cough syrup and blood). Speaks only in onigiri ingredients to keep everyone
safe. Personality: kind, laconic, quietly heroic.

**Design mapping:** A controller whose resource is his own throat.
- *Stats:* 408 / 0.98.
- **"Blast Away"** (neutral): a cone shout with huge knockback for its damage.
- **"Don't Move"** (side): a word-projectile that **locks the target in
  place** — his combo starter and edge-guard.
- **"Get Crushed"** (down): mid-range slam that smashes airborne enemies into
  the ground.
- **Ultimate — "GET TWISTED AND BLAST AWAY":** a stage-buckling scream —
  colossal knockback across most of the arena, followed by an involuntary
  coughing fit (specials sealed 4 s). Power at a price, exactly in character.
- *Passive — Throat Strain:* commands stack strain; three quick casts trigger
  a coughing lockout. Pace your words.

## Panda — "Not Just Any Panda"
**Canon:** An Abrupt Mutated Cursed Corpse built by Principal Yaga with three
cores he thinks of as siblings: the balanced Panda, the power-type **Gorilla**
brother (Unblockable Drumming Beat), and the bashful **Triceratops** sister.
Personality: easygoing, wise-cracking, secretly the school's most stable soul.

**Design mapping:** The armored heavyweight with a mode switch.
- *Stats:* 356 / 1.28 — slowest and heaviest body in the game.
- **Unblockable Drumming Beat** (neutral): the guard-ignoring palm, straight
  from canon.
- **Cursed Corpse Charge** (side): armored tackle — he trades and wins.
- **Gorilla Mode** (down): core swap install — slower, +30% damage, hits
  cannot stagger him.
- **Ultimate — Sister Core: Triceratops:** the third sibling wakes up: an
  unstoppable horned stampede, wall to wall, three passes.
- *Passive — Abrupt Mutated Body:* cotton, cores, and stubbornness — takes 10%
  less knockback from everything.

## Aoi Todo — "My Brother"
**Canon:** Kyoto's powerhouse; **Boogie Woogie** swaps the positions of
anything with cursed energy on a clap. A physical monster (Black Flash user)
whose real weapon is making opponents doubt every distance. Devoted superfan
of idol Takada-chan; adopts kindred spirits as "my brother."
Personality: loud, theatrical, shockingly perceptive in a fight.

**Design mapping:** A grappler whose gimmick is geometry: nowhere is safe when
positions are one clap away.
- *Stats:* 392 / 1.18 — heavy bruiser.
- **Boogie Woogie** (neutral): **swap places with the opponent** instantly,
  with a followup strike as they reel. Projectile incoming? Clap. Cornered?
  Clap.
- **Vigorous Lariat** (side): freight-train shoulder rush.
- **Takada-chan Devotion** (down): a restorative moment of idol worship —
  meter and a little healing.
- **Ultimate — Boogie Woogie: Zero-Distance Finale:** a teleporting beatdown —
  six swaps, six hits, one **Black Flash** finisher.
- *Passive — Ride the Wave:* landing heavies pumps him up: +8 bonus meter per
  heavy hit.

## Momo Nishimiya — "Witch of the Wind"
**Canon:** Kyoto third-year; Tool Manipulation lets her ride and telepathically
steer her broom, firing **Wind Scythe** vacuum blades sharpened with debris.
Personality: prideful, protective of her juniors, fights smart because she
can't fight heavy.

**Design mapping:** The lightest, floatiest zoner — queen of the air, allergic
to getting hit.
- *Stats:* 428 / 0.88 — lightest in the game, best air drift, and **three
  jumps** (broom).
- **Wind Scythe** (neutral): twin vacuum blades.
- **Broom Charge** (side): a flying rush that works midair — offense and
  recovery in one.
- **Updraft** (down): a wind column that flings enemies skyward and lifts
  Momo herself — anti-air and escape hatch.
- **Ultimate — Maximum: Great Tempest:** the whole sky answers: a stage-wide
  storm that drags, grinds, and finally launches.
- *Passive — Tool Manipulation:* the extra jump and drift are the passive.

## Kento Nanami — "The Salaryman"
**Canon:** Ex-salaryman, grade 1 sorcerer. **Ratio Technique** marks any
target with a 7:3 line where a weak point is forced into existence — his blunt
blade always finds it. Declares **Overtime** when work runs late, unlocking
his reserves. Personality: weary professionalism, dry kindness, absolute
reliability.

**Design mapping:** The precision midweight. His whole kit rewards exact
spacing — hit at the 7:3 distance and everything crits.
- *Stats:* 388 / 1.14 — deliberate, sturdy.
- *Signature mechanic:* his lights and heavies have a **crit band** — struck
  from the sweet-spot range they automatically deal 7:3 criticals (+36%
  damage, more launch).
- **Ratio Wave** (neutral): blade wave with a 30% crit chance.
- **Collapse** (side): the stairwell-dropping overhead — 2.4× shield damage.
- **Overtime** (down): the tie comes off: +20% speed and damage for 5 s.
- **Ultimate — Ratio: Certain Kill:** a methodical rush of strikes, every one
  at 7:3, ending in a critical that ends the workday.
- *Passive — Ratio Technique:* the crit bands themselves.

## Toji Fushiguro — "The Sorcerer Killer"
**Canon:** Born Zen'in with a Heavenly Restriction: zero cursed energy,
inhuman body, invisible to curse-sensing. Kills sorcerers with a cursed-tool
arsenal from his inventory spirit: the **Inverted Spear of Heaven** (nullifies
techniques on contact), Playful Cloud, the **Chain of a Thousand Miles**.
Personality: lazy drawl, ruthless pragmatism, apex-predator confidence.

**Design mapping:** The assassin. Fastest kill buttons in the game, tools for
every range, and the unique ability to *turn the opponent's magic off*.
- *Stats:* 465 / 1.04 — near-Gojo speed with a real frame.
- His weapons carry **heavenly** — bonus shield damage and invuln-piercing.
- **Chain of a Thousand Miles** (neutral): a near-hitscan piercing chain snipe.
- **Inverted Spear of Heaven** (side): gap-closing stab that **silences** —
  the victim's specials are sealed for 3 s. Uniquely hateful, exactly canon.
- **Inventory Curse** (down): summons his pact-bound curse; it hovers at his
  shoulder and hurls cursed tools at the enemy while he closes in.
- **Ultimate — Zen'in Massacre Arsenal:** the inventory opens: a
  weapon-swapping execution rush that ends with a silencing finisher.
- *Passive — Invisible to Curses:* dodge invincibility lasts 25% longer, and
  his hits **drain the victim's ultimate meter** — fighting him starves your
  cursed energy.

## Ryomen Sukuna — "King of Curses"
**Canon:** The undisputed King of Curses. **Dismantle** (slashes for objects),
**Cleave** (adjusts to cut cursed targets in one stroke), the fire arrow
(Divine Flame / "Open, Fuga"), and the barrier-less domain **Malevolent
Shrine**, which rains slashes on everything within. Personality: sovereign
cruelty; everyone else is entertainment or ingredients.

**Design mapping:** The aggressive executioner — high damage everywhere, bleed
on everything, and the game's most oppressive ultimate.
- *Stats:* 435 / 1.06 — fast *and* sturdy; he's simply better, as intended.
- His slashes inflict **bleed** (movement-taxed damage over time).
- **Dismantle** (neutral): the fastest slash-wave projectile in the game.
- **Cleave** (side): a two-hit carving dash.
- **Divine Flame: Fuga** (down): "Open." — an arcing fire arrow that
  detonates.
- **Ultimate — Domain Expansion: Malevolent Shrine:** the shrine manifests;
  for 3.6 s slashes rain on the opponent *anywhere in the arena*, shields
  included, capped by a massive finishing cleave.
- *Passive — King's Contempt:* +10% damage to opponents past 80% — he plays
  with food, then eats.

## Mahito — "Soul Shaper"
**Canon:** A curse born from human hatred of humans. **Idle Transfiguration**
reshapes souls on touch — bodies follow. Self-modification (blades, spikes),
Polymorphic Soul Isomers, and the streamlined killing form Instant Spirit Body
of Distorted Killing. Personality: a child-philosopher sadist; souls are toys.

**Design mapping:** Tricky rushdown with the game's command grab.
- *Stats:* 422 / 0.98.
- Everything he lands leaves a **Soul Mark** (+18% damage taken from all
  sources) — his pressure compounds.
- **Idle Transfiguration** (neutral): short-range **unblockable grab**. Shield
  Mahito at your peril.
- **Body Distortion Lunge** (side): arm-blade dash.
- **Transfigured Human** (down): summons a shambling reshaped soul that
  bursts on contact — walking stage control.
- **Ultimate — Instant Spirit Body of Distorted Killing:** his true form:
  +30% speed and **every attack unblockable** for 8 s.
- *Passive — Idle Transfiguration:* the soul marks.

## Suguru Geto — "Curse Collector"
**Canon:** Cursed Spirit Manipulation — swallow defeated curses, command
thousands. Signature releases include the Rainbow Dragon and the merged
hyper-spirit attack **Maximum: Uzumaki**. Personality: silken condescension;
the fallen best friend who chose curses over "monkeys."

**Design mapping:** The summoner-zoner: he spends minions, not effort.
- *Stats:* 398 / 1.04.
- His strikes carry **curse drain** (bonus shield damage — spirits gnaw at
  guards).
- **Cursed Spirit Volley** (neutral): three lightly-homing lesser curses.
- **Rainbow Dragon** (side): summons his prized heavy spirit, which hunts
  the stage on its own until the technique is spent.
- **Kuchisake-Onna's Scissors** (down): plants a lurking curse that erupts
  when the enemy steps close — trap control.
- **Ultimate — Maximum: Uzumaki:** every stockpiled curse wrung into one
  spiraling annihilation that drags victims in and detonates.
- *Passive — Cursed Spirit Manipulation:* summon specials return double
  ultimate meter — his collection feeds itself.

## Jogo — "Disaster of Flame"
**Canon:** A disaster curse born from fear of volcanoes; one-eyed,
short-fused, strongest raw output among the disaster curses. Ember Insects,
lava geysers, Coffin of the Iron Mountain, and **Maximum: Meteor** — he pulled
a meteor onto Shibuya. Personality: proud, perpetually disrespected, explodes
(literally) when mocked.

**Design mapping:** The heavy zoner whose screen is always on fire.
- *Stats:* 368 / 1.16 — slow, hits like an eruption.
- Everything applies **burn**, and his burns tick 50% harder (passive —
  Disaster Curse).
- **Ember Insects** (neutral): arcing fire lobs.
- **Lava Geyser** (side): the floor under the *opponent* erupts — anti-camp.
- **Coffin of the Iron Mountain** (down): furnace armor — unstaggerable and
  searing to the touch (melee attackers get burned).
- **Ultimate — Maximum: Meteor:** a falling star on the opponent's position;
  the crater keeps burning.

## Hanami — "Grief of the Forest"
**Canon:** A disaster curse born from the land's grief at humanity; serene,
mossy, nearly indestructible. Cursed buds that sap strength, root eruptions,
a body harder than old wood. Personality: gentle sorrow, planetary patience —
the kindest thing on the roster and still a monster.

**Design mapping:** The patient fortress. Slow, huge normals, endless
attrition.
- *Stats:* 358 / 1.24 — second-heaviest.
- Attacks inflict **root snare** (slow + sap).
- **Cursed Buds** (neutral): lobbed parasite seeds.
- **Root Eruption** (side): impaling roots under the opponent.
- **Flower Field** (down): a blooming ring that heals him and grants armor —
  the forest reclaims.
- **Ultimate — Domain of the Flowering Forest:** the floor becomes his
  garden: five expanding waves of vines harvest the arena outward from his
  roots.
- *Passive — Old-Growth Body:* 12% less damage taken while grounded — cut the
  tree down before it settles.

## Choso — "Eldest Brother"
**Canon:** The eldest Death Painting Womb — half curse, half human, animated
by **Blood Manipulation**: Piercing Blood (blood pressurized past the speed of
sound), Convergence, Flowing Red Scale (overclocking his own blood), and
Supernova (orbiting blood orbs detonated at once). Personality: quiet,
implacable, defined entirely by love for his brothers — including, after one
very strange fight, Yuji.

**Design mapping:** A zoner who pays in blood. His projectiles are the best
pound-for-pound in the game, and every one of them costs him a sliver of his
own health — his resource bar is his damage meter.
- *Stats:* 405 / 1.06 — deliberate, sturdy midweight.
- **Piercing Blood** (neutral): a near-hitscan piercing lance across the whole
  lane. Costs 1.5% of himself per shot.
- **Convergence: Blood Meteorite** (side): a dense arcing sphere that
  detonates on arrival. Costs 2%.
- **Flowing Red Scale** (down): overclocks his blood — +22% speed, +18%
  damage, and it burns him slowly the whole time it's held.
- **Ultimate — Supernova:** orbs of compressed blood ring the enemy, close in,
  and all detonate inward — escapable by leaving the ring, lethal inside it.
- *Passive — Death Painting Body:* immune to bleed and poison (he *is* the
  blood), which also makes him the natural counter to Sukuna's chip game.

## Mei Mei — "The Mercenary"
**Canon:** Grade 1 sorcerer who fights exclusively for money; wields a
battle-axe and **Black Bird Manipulation** — crows as scouts and, at the
limit, **Bird Strike**: a crow that abandons self-preservation gains force
beyond all reason. Personality: silken, transactional, genuinely dangerous —
every kindness is an invoice.

**Design mapping:** A balanced axe-fighter whose economy is literal: she
converts meter to power and gets paid better than anyone for landing hits.
- *Stats:* 425 / 1.00 — even frame, axe gives her heavy shield pressure
  (2.0× shield damage on heavies).
- **Crow Scout** (neutral): a homing crow dive — cheap, persistent chip.
- **Axe Rush** (side): an advancing overhead arc with brutal shield damage.
- **Advance Payment** (down): spends 15 ultimate meter for +25% damage over
  4 s. If she can't afford it, the card declines.
- **Ultimate — Bird Strike:** the limit-broken crow crosses the arena like a
  cannon shell, unblockable, with the flock homing in behind it.
- *Passive — Everything Has a Price:* +25% ultimate meter from damage dealt,
  and every new stock starts with an advance payment of meter. She is never
  not accruing.

## Takako Uro — "Sky Manipulator"
**Canon:** Heian-era assassin leader reincarnated into the Culling Game; her
technique treats **the sky itself as a surface** she can touch, fold, bend and
weaponize — attacks arrive from impossible angles, projectiles curve away,
and space itself can slam shut. Personality: prickly pride over old wounds,
a professional soldier's pragmatism, and real joy in a proper fight.

**Design mapping:** The air-superiority trickster. Nothing about her plays in
a straight line: her poke arrives out of the air behind you, and shooting at
her is a good way to get shot.
- *Stats:* 432 / 0.90 — light, fast, **three jumps** and the second-best air
  drift in the game.
- **Sky Warp Palm** (neutral): marks the spot the target holds, then the blow
  falls out of the sky onto it a beat later — dodge by not standing there.
- **Surface Dive** (side): kicks off a fold in the air; a swooping strike
  that works midair and doubles as recovery.
- **Sky Fold** (down): curves the sky into a lens — a counter stance that
  answers melee *and bends projectiles straight back at their owner*. The
  anti-zoner button.
- **Ultimate — Inverted Sky:** the sky folds shut around the enemy, hoists
  them off the earth, and slams them back into it. Whiffs if nobody is under
  her sky.
- *Passive — Mistress of the Air:* 12% less damage and knockback while
  airborne. Fight her on the ground; you won't get to.

## Yuji Itadori — "Sukuna's Vessel"
**Canon:** The vessel of the King of Curses — a physically freakish, endlessly
kind-hearted student whose signature is **Divergent Fist** (his cursed energy
lags a beat behind his fist, so one punch lands twice) and, once his timing
sharpens, **Black Flash** — cursed energy applied within a millionth of a
second of impact, distorting space and multiplying force. Superhuman
athleticism, the Manji Kick, and a refusal to stay down. Personality: warm,
direct, self-sacrificing — "I'll be the cog"; he saves people so they can have
a proper death.

**Design mapping:** The honest fists-first brawler with a slot-machine heart:
his whole kit is clean fundamentals, and the Black Flash roll is the spike of
drama on top.
- *Stats:* 448 / 1.02 — third-fastest ground speed; a pure rushdown frame.
- **Divergent Fist** (neutral): a punch whose cursed-energy impact arrives a
  beat later — one input, two hits, and the delayed hit is the launcher. Great
  for catching shields dropped too early.
- **Manji Kick** (side): a sliding low kick that sweeps in under pokes.
- **Unbreakable Grit** (down): plants his feet — brief hyper-armor and reduced
  damage. He just keeps coming, exactly like the manga panels.
- **Ultimate — Black Flash: Consecutive:** the zone. A rush of blows where
  every hit is on the edge of a Black Flash, capped with one that isn't on the
  edge of anything.
- *Passive — Black Flash:* every melee hit has a 12% chance to spark: bonus
  damage, extra launch, and a surge of ultimate meter. Feast or famine, like
  the real thing.

## Reggie Star — "The Contractor"
**Canon:** A Culling Game player whose cursed technique materializes anything
he has a **purchase receipt** for — a katana umbrella, insecticide, a futon,
and famously an entire car dropped on his opponent mid-fight. Personality:
smug, theatrical dealmaker; treats every fight as a negotiation he has already
won.

**Design mapping:** The wildcard zoner. His screen presence is a shopping
spree: blade waves, poison clouds, and appliances falling from the sky —
some deliveries are better than others.
- *Stats:* 402 / 1.05 — midweight who wants to fight from behind his purchases.
- **Receipt: Katana Umbrella** (neutral): a blade wave off the umbrella's
  edge — his bread-and-butter poke.
- **Receipt: Insecticide** (side): a lingering aerosol cloud that **poisons**
  (ticking damage plus a slow) and seeps through guards — area denial in a
  can.
- **Receipt: Big-Ticket Item** (down): something heavy materializes over the
  enemy: a vending machine, a motorbike... or a futon. Terms and conditions
  apply.
- **Ultimate — Grand Contract: Luxury Sedan:** the car. It arrives at
  terminal velocity on the opponent's position, then keeps going as a
  battering ram across the floor.
- *Passive — Paper Trail:* the fine print always favors him — special
  cooldowns tick 18% faster, so the deliveries never stop.

## Yoshinobu Gakuganji — "The Old Guard"
**Canon:** The conservative principal of Kyoto Jujutsu High — an old man on
the Big Three's conservative wing whose cursed technique **amplifies cursed
energy through melody**, channeled via an electric guitar. He shreds. His
riffs travel as destructive waves of amplified sound. Personality: stern
traditionalist, institutional to the bone — until the guitar comes out.

**Design mapping:** The slow fortress-zoner whose walls are made of sound.
Weakest legs on the roster, but a stage that is always ringing.
- *Stats:* 356 / 1.18 — slowest fighter in the game; plays entirely off
  spacing and walls.
- **Power Chord** (neutral): a piercing wall of amplified sound down the lane.
- **Feedback Wall** (side): plants a standing wave of shrieking feedback that
  erupts when crossed — his zoning anchor.
- **Distortion Solo** (down): steps on the pedal — while it rings, every
  Power Chord comes out doubled, plus a general damage lift.
- **Ultimate — Deadly Melody: Encore:** the full performance: waves of sound
  roll off him in both directions, shoving and grinding everyone in range,
  until the closing chord throws the crowd.
- *Passive — Unshakeable Tradition:* takes 25% less hitstun. Decades on every
  kind of stage; the old man barely flinches, which makes comboing him a
  genuinely different problem.

---

## Roster balance at a glance

| Fighter | Archetype | Speed | Weight | Wins by |
|---|---|---|---|---|
| Gojo | Mobile all-rounder | ★★★★★ | Light | Spacing control, untouchability |
| Yuta | All-rounder | ★★★☆ | Mid | Fundamentals + Rika swings |
| Hakari | Momentum brawler | ★★★☆ | Mid-heavy | Reaching Jackpot |
| Maki | Anti-defense rushdown | ★★★★★ | Mid | Shield destruction |
| Megumi | Summon tactician | ★★★★ | Light | Stage control |
| Nobara | Mark zoner | ★★★☆ | Mid | Nail economy cash-outs |
| Inumaki | Controller | ★★★☆ | Mid | Stuns into edge-guards |
| Panda | Armored heavy | ★★ | Heaviest | Trades and armor |
| Todo | Swap grappler | ★★★ | Heavy | Position mind-games |
| Momo | Aerial zoner | ★★★★ | Lightest | Air superiority |
| Nanami | Precision mid | ★★★ | Mid-heavy | 7:3 spacing crits |
| Toji | Assassin | ★★★★★ | Mid | Speed + silencing techniques |
| Sukuna | Aggressive executioner | ★★★★ | Mid-heavy | Raw damage, domain |
| Mahito | Tricky rushdown | ★★★★ | Mid | Command grabs, soul marks |
| Geto | Summoner-zoner | ★★★☆ | Mid | Minion attrition |
| Jogo | Heavy zoner | ★★☆ | Heavy | Burn attrition, meteor |
| Hanami | Fortress | ★★☆ | Very heavy | Outlasting everyone |
| Choso | Blood zoner | ★★★☆ | Mid-heavy | Premium projectiles paid in HP |
| Mei Mei | Economy all-rounder | ★★★★ | Mid | Meter economy, axe shield pressure |
| Uro | Aerial trickster | ★★★★ | Light | Air control, reflected projectiles |
| Yuji | Rushdown brawler | ★★★★★ | Mid | Fundamentals + Black Flash spikes |
| Reggie | Wildcard zoner | ★★★☆ | Mid | Area denial, falling appliances |
| Gakuganji | Sound fortress | ★☆ | Heavy | Walls of sound, unflinching trades |

All 23 fighters are live. The six round-7 additions (Choso, Mei Mei, Uro, Yuji,
Reggie, Gakuganji) were built and balanced in code before their art existed;
that history is in [asset-requests-history.md](asset-requests-history.md).

## References

- [Jujutsu Kaisen Wiki — Idle Death Gamble](https://jujutsu-kaisen.fandom.com/wiki/Idle_Death_Gamble) (jackpot: 4:11 of infinite cursed energy, reflexive RCT immortality)
- [Gamerant — Hakari's Cursed Technique, Explained](https://gamerant.com/jujutsu-kaisen-kinji-hakari-cursed-technique-private-pure-love-train-explained/)
- [Jujutsu Kaisen Wiki — Gorilla Mode](https://jujutsu-kaisen.fandom.com/wiki/Gorilla_Mode) / [Gamerant — Panda's Cursed Corpse Cores](https://gamerant.com/jujutsu-kaisen-panda-cursed-corpse-cores/) (three sibling cores; Triceratops sister)
- [Jujutsu Kaisen Wiki — Tool Manipulation](https://jujutsu-kaisen.fandom.com/wiki/Tool_Manipulation) / [Wind Scythe](https://jujutsu-kaisen.fandom.com/wiki/Wind_Scythe)
- [Jujutsu Kaisen Wiki — Cursed Speech](https://jujutsu-kaisen.fandom.com/wiki/Cursed_Speech) / [CBR — The Power and Drawbacks of Inumaki's Cursed Speech](https://www.cbr.com/jujutsu-kaisen-the-power-and-drawbacks-of-inumakis-cursed-speech-explained/)
