// THE LEDGE BRAKE: momentum never walks a fighter off, a held direction always
// does. Both halves matter, and they pull against each other — a brake strong
// enough to stop the slide is one stroke away from gluing everyone to the stage
// and killing edge-cancels, ledge drops and chasing somebody off the end.
//
// Smash draws this line with the TEETER: walk to the lip slowly and the
// character stops there and will not step off until the stick goes past a
// threshold (ssbwiki.com/Teeter). That needs an analog walk to hang off, and
// this game has none — `dirX` is ±1 past a deadzone. What it can read instead
// is intent: held is deliberate, coasting is not. These checks are that rule
// stated as numbers.
//
//   node server.mjs   then:   node tools/smoke_ledge.mjs [baseUrl]

import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

// The bar for "travelled, not teleported", in px of rendered movement in one
// frame. Ordinary movement is the yardstick: a full-speed run covers 7.8 px in
// a frame and a fast fall 15. The four climbs off a ledge are timed to clear
// the run (measured 7.9-8.2); the CATCH is deliberately quicker, because it is
// hands closing on a ledge rather than a body pulling itself up, and it is
// bounded by the fall it interrupts instead. 13 sits between the two and is
// still seven times under the 98 px teleport this replaced.
const MOVE_BAR = 13;
let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log(`  page error: ${String(e).slice(0, 200)}`));

try {
  await page.goto(`${BASE}/?camera=flat`);
  await pressStart(page);
  await page.waitForSelector('[data-character="gojo"]', { timeout: 120000 });
  await page.click('[data-character="gojo"]');
  await page.waitForTimeout(300);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 15000 });
  await page.locator(".stage-card").nth(0).click();
  for (let w = 0; ; w += 150) {
    const ok = await page.evaluate(async () => {
      const { state } = await import("/src/state.js");
      return state.phase === "playing" && state.fighters.length > 1;
    });
    if (ok) break;
    if (w > 120000) throw new Error("match never started");
    await page.waitForTimeout(150);
  }

  const r = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const { updateFighter } = await import("/src/fighter.js");
    const { blankInput } = await import("/src/input.js");
    const { fighterTransform } = await import("/src/motion.js");
    const { hangGripShift } = await import("/src/render.js");
    const dt = 1 / 60;
    const [a, b] = state.fighters;
    const main = (state.platforms || []).find((p) => p.kind === "main");
    const edge = main.x + main.w;
    for (const f of state.fighters) { f.aiState = null; f.stocks = 99; f.invuln = 0; }
    b.x = -9999;                        // out of the way; this is about geometry

    const reset = (fromEdge) => {
      Object.assign(a, { x: edge - fromEdge, y: main.y, vx: 0, vy: 0, grounded: true,
        dashT: 0, hitstun: 0, action: null, facing: 1, invuln: 0,
        respawnTimer: 0, dead: false, ledge: null });
      a.lastTap = { dir: 0, t: -10 };
    };
    const IN = (o) => ({ ...blankInput(), ...o });
    const settle = (frames, input) => {
      for (let i = 0; i < frames; i++) updateFighter(a, dt, input);
    };

    const out = {};

    // 0. A LUNGE IS BRAKED LIKE ANYTHING ELSE — and this runs FIRST, because
    //    it is the one check here that needs a fighter in ordinary standing
    //    condition. Run after the ledge checks it inherited a fighter who
    //    would not land for sixty frames, and a lunge in the air has no ground
    //    friction to drag it and no brake to stop it, so it passed for the
    //    wrong reason and then failed for the right one.
    //
    //    `dashStrike` specials set their own velocity and lock movement for `dashStrike` specials set
    //    half a second, so the player picks neither the speed nor the moment
    //    it ends — and until the brake covered them they were far and away the
    //    commonest way anyone left a platform without deciding to. Holding the
    //    direction still takes it over, exactly as a run does.
    {
      const { performSpecial } = await import("/src/specials.js");
      const { CHARACTERS, getActor } = await import("/src/characters.js");
      const lungeKey = Object.keys(CHARACTERS).find((k) =>
        ["neutral", "side", "down"].some((sl) =>
          CHARACTERS[k].specials?.[sl]?.type === "dashStrike"));
      const lungeSlot = lungeKey && ["neutral", "side", "down"].find(
        (sl) => CHARACTERS[lungeKey].specials[sl].type === "dashStrike");
      out.lungeChar = lungeKey || null;
      if (lungeKey) {
        // Borrowed, and given back: every check below is Gojo's, and leaving
        // the fighter as somebody else changed their speed, friction and reach
        // under the rest of the file.
        const ownKey = a.charKey;
        const ownChar = a.char;
        const cast = (input) => {
          reset(60);
          a.charKey = lungeKey;
          a.char = getActor(lungeKey) || CHARACTERS[lungeKey];
          Object.assign(a, {
            specialCd: {}, cooldowns: {}, meter: 100, ledgeMove: null,
            ledgeGrabs: 0, stocks: 99, respawnTimer: 0, respawnPlat: null,
            charging: null, dropTimer: 0, landLag: 0, airT: 0, shielding: false,
          });
          // LAND them rather than declaring them landed. Setting grounded
          // true and y to the deck did not survive the state the checks above
          // leave behind — the fighter stayed airborne, and a lunge in the air
          // has no ground friction to drag it and no brake to stop it, so the
          // trace read as a pass for entirely the wrong reason. Dropping onto
          // the platform is the path the game itself uses.
          Object.assign(a, { y: main.y - 6, vy: 60, grounded: false });
          for (let i = 0; i < 60 && !a.grounded; i++) updateFighter(a, dt, blankInput());
          settle(2, blankInput());
          // AFTER settling: a fighter standing still turns to face the
          // opponent, and this one is parked far to the left, so the lunge
          // fired backwards into open stage and the check passed on a fighter
          // who never went near the lip.
          a.facing = 1;
          const stocks0 = a.stocks;
          const wasStanding = a.grounded;
          performSpecial(a, lungeSlot);
          const fired = !!a.action;
          // Only as long as the action, plus the slide it leaves: running on
          // past that lets a respawn move the fighter and read as a pass.
          // Only as long as the action, plus the slide it leaves: running on
          // past that lets a respawn move the fighter and read as a pass.
          for (let i = 0; i < 90 && (a.action || Math.abs(a.vx) > 2); i++) {
            updateFighter(a, dt, input);
          }
          return {
            grounded: a.grounded, past: +(a.x - edge).toFixed(1),
            lost: stocks0 - a.stocks, cast: fired, stood: wasStanding,
            vx: Math.round(a.vx),
          };
        };
        const loose = cast(blankInput());
        const held = cast(IN({ right: true, dirX: 1, moveX: 1 }));
        a.charKey = ownKey;
        a.char = ownChar;
        out.lungeStopped = loose.stood && loose.cast && loose.grounded
          && loose.lost === 0 && loose.past <= 30;
        out.lungePast = loose.past;
        out.lungeLost = loose.lost;
        out.lungeHeldLeft = held.stood && held.cast && !held.grounded;
      }
    }

    // 0b. A DASH ATTACK IS A LUNGE TOO, and the same two things are true of it:
    //     it runs out, and it plants when it ends unless you are still asking
    //     to go that way. It used to be `keepMomentum` — no friction at all —
    //     so a light press at a run opened at 902 px/s against a 452 px/s run,
    //     held it for the whole action, and ended still doing 902: 556 px of
    //     swing and 481 px of free coast, 1037 px across a 784 px platform.
    //     Measured well away from any edge, so this is about the move's own
    //     distance and not about the brake.
    {
      const dashAttack = (button, after) => {
        // Mid-platform and pointed at the far side, with room to run out.
        Object.assign(a, { x: main.x + 40, y: main.y, vx: 0, vy: 0, grounded: true,
          dashT: 0, hitstun: 0, action: null, facing: 1, invuln: 0,
          respawnTimer: 0, dead: false, ledge: null, ledgeMove: null,
          charging: null, shielding: false, landLag: 0, stocks: 99 });
        a.lastTap = { dir: 0, t: -10 };
        const go = IN({ right: true, dirX: 1, moveX: 1 });
        settle(40, go);                       // up to a real run first
        const from = a.x;
        const runSpeed = Math.abs(a.vx);
        updateFighter(a, dt, { ...go, [`${button}P`]: true });
        const fired = !!a.action;
        let frames = 0;
        while (a.action && frames < 200) { updateFighter(a, dt, after); frames++; }
        const atEnd = Math.abs(a.vx);
        for (let i = 0; i < 200 && Math.abs(a.vx) > 2; i++) updateFighter(a, dt, after);
        return {
          fired, runSpeed: Math.round(runSpeed), atEnd: Math.round(atEnd),
          total: Math.round(a.x - from),
        };
      };
      const loose = dashAttack("light", blankInput());
      const held = dashAttack("light", IN({ right: true, dirX: 1, moveX: 1 }));
      const heavy = dashAttack("heavy", blankInput());
      out.daFired = loose.fired && held.fired && heavy.fired;
      out.daLoose = loose;
      out.daHeld = held;
      out.daHeavy = heavy;
      out.daPlatformW = Math.round(main.w);
    }


    // 1. Dash at the edge, then LET GO. The slide must stop on the platform.
    //    Started INSIDE the un-braked stopping distance on purpose: a single
    //    dash flick used to need 42px of runway and this begins with 20, so
    //    without the brake this walks off and the check is worth running.
    reset(20);
    updateFighter(a, dt, IN({ right: true, dirX: 1, dashFlick: 1 }));
    out.dashPeakV = Math.round(Math.abs(a.vx));
    settle(200, blankInput());
    out.releasedGrounded = a.grounded;
    out.releasedPastEdge = +(a.x - edge).toFixed(1);

    // 2. The same dash with the direction HELD must still leave the stage.
    reset(60);
    settle(60, IN({ right: true, dirX: 1, dashFlick: 1 }));
    out.heldGrounded = a.grounded;
    out.heldX = Math.round(a.x);

    // 3. A plain run, released. Same rule: no coasting off. Run up to full
    //    speed and let go with 30px left — a full-speed slide carries about
    //    56px un-braked, so this is inside it too.
    reset(220);
    for (let i = 0; i < 400 && edge - a.x > 30; i++) {
      updateFighter(a, dt, IN({ right: true, dirX: 1 }));
    }
    out.runReleaseV = Math.round(Math.abs(a.vx));
    out.runReleaseGap = +(edge - a.x).toFixed(1);
    settle(200, blankInput());
    out.runReleasedGrounded = a.grounded;

    // 4. THE TEETER. Walking at the lip stops there however long you hold it;
    //    pushing the stick to a run goes over. This is the half that needs the
    //    analog walk to exist at all.
    reset(80);
    settle(200, IN({ right: true, dirX: 1, moveX: 0.45 }));
    out.walkHeldGrounded = a.grounded;
    out.walkV = Math.round(Math.abs(a.vx));
    reset(80);
    settle(200, IN({ right: true, dirX: 1, moveX: 1 }));
    out.runHeldGrounded = a.grounded;

    // 5. Knockback is NOT braked — being hit off the stage is the game working.
    reset(30);
    a.hitstun = 0.6; a.vx = 900;
    settle(40, blankInput());
    out.hitstunLeft = !a.grounded;

    // 6a. THE LEDGE IS TRAVELLED, NOT TELEPORTED. Catching a ledge and getting
    //     off one used to be single-frame jumps of 40-110px; they are now
    //     transitions the fighter makes on the clock, with a pose per phase
    //     (fighter.js beginLedgeMove). Two things are asserted, because either
    //     alone can be true while the thing still looks wrong:
    //
    //     WHERE — the worst single-frame step of the position the RENDERER
    //     uses, against MOVE_BAR below.
    //     WHAT — the sequence of poses drawn across it. A body that slides
    //     smoothly while holding its hang pose the whole way is still wrong;
    //     the fall has to reach the ledge before the hang starts, and the
    //     climb has to rise and land.
    //     AND THE ANCHOR COUNTS. A hang is not drawn at the fighter's position:
    //     the grip goes on the platform corner, which carries the body ~130 px
    //     down. This measured the position and the motion offsets only, and an
    //     anchor is neither — so it read the ledge as smooth throughout while
    //     the body was in fact pinned for the whole catch and popping 110-139
    //     px on the way out. Everything the renderer moves the drawing by, or
    //     the check is measuring something nobody sees.
    const drawnAt = () => {
      const m = fighterTransform(a);
      const g = hangGripShift(a, a.char.scale);
      return { x: a.x + (m.offsetX || 0) + g.x, y: a.y + (m.offsetY || 0) + g.y };
    };
    const trace = (frames, input) => {
      const anims = [];
      // What is drawn WHILE the transition is running, which is the half a
      // sequence of state names cannot see: "fall -> ledge" is equally true of
      // a fighter who fell, snapped, and hung, and of one who carried the fall
      // all the way onto the ledge. Only this tells them apart.
      const during = {};
      let prev = drawnAt();
      let worst = 0;
      for (let i = 0; i < frames; i++) {
        updateFighter(a, dt, input);
        const d = drawnAt();
        worst = Math.max(worst, Math.hypot(d.x - prev.x, d.y - prev.y));
        prev = d;
        if (anims[anims.length - 1] !== a.animKey) anims.push(a.animKey);
        const kind = a.ledgeMove?.kind;
        if (kind) (during[kind] ||= []).push(a.animKey);
      }
      return { worst: +worst.toFixed(1), anims, during };
    };
    // Fall past the lip into a catch. reset() first, because check 5 threw this
    // fighter off the stage and a respawn in flight is its own teleport.
    //
    const fallToLedge = () => {
      reset(0);
      Object.assign(a, {
        x: edge + 26, y: main.y - 40, vx: 0, vy: 40, grounded: false,
        facing: -1, ledge: null, ledgeMove: null, ledgeCooldown: 0, airT: 1,
        respawnTimer: 0, respawnPlat: null, teeterT: 0, teeterDir: 0,
      });
    };
    fallToLedge();
    const grab = trace(26, blankInput());
    out.grabStep = grab.worst;
    out.grabAnims = grab.anims;
    out.grabDuring = grab.during.catch || [];
    out.grabbed = !!a.ledge;
    // ...then climb back on.
    // Settled first: the grip takes LEDGE_GRIP_RELEASE to take the body, and an
    // exit tested before it has is an exit with less to hand back than a real
    // one — the release is the part being measured.
    trace(24, blankInput());
    const climb = trace(30, IN({ left: true, dirX: -1 }));
    out.getupStep = climb.worst;
    out.climbAnims = climb.anims;
    out.climbDuring = climb.during.climb || [];
    out.gotUp = a.grounded && !a.ledge;
    // The roll off it is its own pose.
    fallToLedge();
    trace(46, blankInput());
    const roll = trace(48, IN({ shieldHeld: true }));
    out.rollStep = roll.worst;
    out.rollAnims = roll.anims;
    out.rollDuring = roll.during.roll || [];
    // The ledge attack climbs before it swings.
    fallToLedge();
    trace(46, blankInput());
    const atk = trace(30, IN({ lightP: true }));
    out.attackStep = atk.worst;
    out.attackAnims = atk.anims;

    // Jumping off never teleported once the placement was dropped: push off
    // FROM the hang and let the arc carry.
    fallToLedge();
    trace(46, blankInput());
    const hop = trace(16, IN({ jumpP: true }));
    out.jumpStep = hop.worst;

    // 6c. LEDGE CAMPING IS PUNISHABLE, on Smash's two rules.
    //
    //     ONE: intangibility ends before the getup does, so the arrival is a
    //     punish window rather than a free re-entry. Measured as the frame the
    //     invulnerability runs out, against the frame the fighter is standing.
    //
    //     TWO: it decays per regrab and only the GROUND resets it — 0.8x after
    //     one regrab, 0.5x after two, nothing from three on (ssbwiki.com/Edge).
    //     Grab, drop, grab again without touching the stage, four times, and
    //     read the window each time.
    fallToLedge();
    settle(40, blankInput());            // the catch completes, hang held
    let climbing = 0;
    let exposed = 0;
    updateFighter(a, dt, IN({ left: true, dirX: -1 }));
    while (a.ledgeMove) {
      climbing++;
      if (a.invuln <= 0) exposed++;
      updateFighter(a, dt, IN({}));
    }
    out.climbFrames = climbing;
    out.climbExposedFrames = exposed;
    out.exposedOnArrival = a.invuln <= 0 && a.grounded;

    // The decay. reset() grounds the fighter, so the count starts clean.
    const grabInvuln = [];
    reset(0);
    a.ledgeGrabs = 0;
    for (let n = 0; n < 4; n++) {
      Object.assign(a, {
        x: edge + 26, y: main.y - 40, vx: 0, vy: 0, grounded: false,
        facing: -1, ledge: null, ledgeMove: null, ledgeCooldown: 0, airT: 1,
        invuln: 0, hitstun: 0, action: null, respawnTimer: 0, dead: false,
      });
      for (let i = 0; i < 8 && !a.ledge; i++) updateFighter(a, dt, blankInput());
      grabInvuln.push(+a.invuln.toFixed(3));
      // Drop off without ever touching the stage — the camping loop.
      a.ledge = null; a.ledgeMove = null; a.ledgeCooldown = 0; a.invuln = 0;
    }
    out.grabInvuln = grabInvuln;
    out.grabCount = a.ledgeGrabs;
    // ...and the ground clears it.
    reset(0);
    settle(2, blankInput());
    out.groundedResets = a.ledgeGrabs;

    // 6b. TEETERING. The brake stops a fighter on the lip constantly and
    //     nothing drew it. Stand, then coast into the edge: wasGrounded has to
    //     be true for the brake to be armed at all.
    reset(80);
    Object.assign(a, {
      ledgeMove: null, ledgeCooldown: 0, ledgeGrabs: 0,
      teeterT: 0, teeterDir: 0, airT: 0, respawnPlat: null,
    });
    // Walked into the lip, which check 4 already proves stops them on it —
    // the point here is what they DRAW once stopped, not that they stop.
    settle(200, IN({ right: true, dirX: 1, moveX: 0.45 }));
    out.teeterAnim = a.animKey;
    out.teeterDir = a.teeterDir;
    out.teeterGrounded = a.grounded;
    // THE FOOT GOES ON THE LIP. The brake stops every fighter's centre the same
    // fixed distance past the edge, and each teeter drawing carries its front
    // foot somewhere different inside its own plate, so the drawing is slid
    // sideways to put that foot on the real edge (render.js teeterLip, and the
    // `teeter` anchor bake_anchors.py measures). Cosmetic — the fighter's x is
    // untouched — which is why it is checked here rather than in the geometry
    // above: what has to hold is that the renderer is ASKED for it, on the
    // right edge, and only while they are facing the drop.
    const { teeterLip } = await import("/src/render.js");
    // FACING THE DROP, which in this fixture has to be said out loud: the
    // dummy opponent is parked far to the LEFT so it stays out of the geometry,
    // and a standing fighter turns to face the nearest one — so the fixture's
    // fighter reaches the right-hand lip looking inland, which is the one case
    // the anchor deliberately skips (the drawing's front foot is on the other
    // side then). Both readings are checked, this one first.
    a.facing = a.teeterDir;
    const lipTarget = teeterLip(a);
    out.teeterAnchor = lipTarget && {
      name: lipTarget.name, axis: lipTarget.axis,
      onEdge: Math.round(lipTarget.x - edge),
    };
    const wasFacing = a.facing;
    a.facing = -a.teeterDir;                 // turned round at the lip
    out.teeterAnchorTurned = teeterLip(a);
    a.facing = wasFacing;
    out.teeterAnchorBaked = !!(await import("/sprites/src/sprites.js"))
      .anchorPoint(a.spriteChar || a.charKey, "teeter", "teeter");

    // 6. Standing still at the lip is undisturbed — the brake must not shove
    //    anyone back from where they are legitimately allowed to stand.
    reset(0);
    a.vx = 0;
    const restX = a.x;
    settle(30, blankInput());
    out.restMoved = +(a.x - restX).toFixed(2);

    return out;
  });

  check(r.releasedGrounded, "a dash released before the lip stops on the platform",
    `ended ${r.releasedPastEdge > 0 ? `${r.releasedPastEdge}px past the lip` : "short of the lip"}, `
    + `peak ${r.dashPeakV} px/s`);
  check(!r.heldGrounded, "...but holding the direction still runs off the end",
    `x=${r.heldX} against an edge at the platform's end`);
  check(r.runReleasedGrounded, "a run released before the lip stops too",
    `let go at ${r.runReleaseV} px/s with ${r.runReleaseGap}px of platform left`);
  check(r.walkHeldGrounded, "walking into the lip teeters there, however long it is held",
    `held tilt 0.45 for 200 frames`);
  check(!r.runHeldGrounded, "...and pushing the stick to a run goes straight over");
  check(r.hitstunLeft, "knockback is never braked — hitstun still leaves the stage");

  // ---- the hang pose is only worn while there is something to hang from
  //
  // Every ledge exit is taken inside `updateLedge`, and that branch of
  // `updateFighter` returns before `pickAnim` — so an exit that does not name a
  // pose leaves the fighter wearing the hang, hand closed on air, until the
  // next step picks one. The DROP-OFF did that: it clears `f.ledge`, sets a
  // velocity and returns, naming nothing.
  //
  // One step is not nothing. The cross-fade ghosts the outgoing drawing for
  // 0.08s, so a single bad step is five frames of a hand hanging off a corner
  // that is not there, which is how it was noticed.
  //
  // Stepped by hand, because the fault is one step wide and anything sampling
  // over requestAnimationFrame is racing the page's own loop for who reads the
  // fighter first. And stepped until the hang has SETTLED first: a grab starts
  // a `catch` transition and `f.ledge` is set while that runs, so stopping at
  // `f.ledge` alone leaves the fighter mid-reach, where the hang timer is not
  // read at all and this branch is unreachable.
  const orphan = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const { updateFighter } = await import("/src/fighter.js");
    const { blankInput } = await import("/src/input.js");
    const f = state.fighters[0];
    const plat = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
    const dt = 1 / 60;

    Object.assign(f, {
      x: plat.x - 24, y: plat.y + 40, vx: 0, vy: 60, grounded: false, airT: 0.5,
      ledge: null, ledgeMove: null, ledgeCooldown: 0, hitstun: 0, action: null,
      dead: false, respawnTimer: 0,
    });
    for (let i = 0; i < 120 && !(f.ledge && !f.ledgeMove); i++) {
      updateFighter(f, dt, blankInput());
    }
    if (!(f.ledge && !f.ledgeMove)) return { hung: false };
    // Past the 2.8s hang timer, which is the same branch as pressing down.
    f.ledgeTimer = 3;
    updateFighter(f, dt, blankInput());
    return {
      hung: true, pose: f.animKey,
      orphan: f.animKey === "ledge" && !f.ledge && !f.ledgeMove,
    };
  });
  check(orphan.hung, "a fighter dropped beside the lip catches it and settles into the hang");

  // ---- and the hang is never drawn with the hand off the corner
  //
  // The pose used to arrive with `f.ledge`, which is the frame the CATCH lands
  // — but the drawing is still ninety pixels away at that point, because the
  // grip takes the body over its own ramp. So the hang appeared gripping air
  // and crept onto the corner over the next twenty frames, which is what gets
  // reported as "the hang shows too early".
  //
  // The pose waits for the grip now (fighter.js hangAnim). Measured rather than
  // asserted from the flag: where the drawing's own `ledge` anchor ends up,
  // against the corner it is supposed to be holding.
  const grip = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const { updateFighter } = await import("/src/fighter.js");
    const { blankInput } = await import("/src/input.js");
    const { hangGripShift } = await import("/src/render.js");
    const { currentFrame, anchorOffset } = await import("/src/render_backend.js");
    const { getActor } = await import("/src/characters.js");

    const f = state.fighters[0];
    const plat = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
    const key = f.spriteChar || f.charKey;
    const scale = getActor(key)?.scale;
    const dt = 1 / 60;

    Object.assign(f, {
      x: plat.x - 24, y: plat.y + 40, vx: 0, vy: 60, grounded: false, airT: 0.5,
      ledge: null, ledgeMove: null, ledgeCooldown: 0, hitstun: 0, action: null,
      dead: false, respawnTimer: 0, hangGrip: null, hangGripW: 0,
      animKey: "fall", animTime: 0.2, prevAnim: null,
    });
    let drawn = 0, worst = 0;
    for (let i = 0; i < 90; i++) {
      updateFighter(f, dt, blankInput());
      if (f.animKey !== "ledge" || !f.hangGrip) continue;
      const frame = currentFrame(key, f.animKey, f.animTime);
      const a = frame && anchorOffset(key, frame, "ledge", { scale, facing: f.facingVis ?? f.facing });
      if (!a) continue;
      const g = hangGripShift(f, scale);
      drawn++;
      worst = Math.max(worst, Math.hypot(
        f.x + a.x + g.x - f.hangGrip.x, f.y + a.y + g.y - f.hangGrip.y));
      if (drawn > 8) break;
    }
    return { drawn, worst: Math.round(worst) };
  });
  check(grip.drawn > 0, "the hang is reached and drawn", `${grip.drawn} frame(s) of it`);
  check(grip.worst <= 2,
    "and never drawn with the gripping hand off the corner",
    `worst ${grip.worst}px over ${grip.drawn} hang frame(s) — it was 90px on the `
    + "frame the catch landed");
  check(orphan.hung && !orphan.orphan,
    "and letting go changes the pose on the same step it lets go",
    `drew \`${orphan.pose}\` — remove the guard in fighter.js and this is \`ledge\`, `
    + "a hand gripping air");
  check(Math.abs(r.restMoved) < 0.01, "standing at the lip is left alone",
    `moved ${r.restMoved}px`);
  check(r.grabbed && r.grabStep <= MOVE_BAR,
    "catching a ledge is travelled, not teleported",
    `worst frame ${r.grabStep}px of ${MOVE_BAR}${r.grabbed ? "" : " (NEVER GRABBED)"}`);
  check(r.grabDuring.length >= 4 && r.grabDuring.every((k) => k === "fall")
      && r.grabAnims.includes("ledge"),
    "...drawing the fall all the way to the ledge, then the hang",
    `${r.grabDuring.length} frame(s) of ${[...new Set(r.grabDuring)].join("/")}`
    + ` then ${r.grabAnims.join(" -> ")}`);
  check(r.gotUp && r.getupStep <= MOVE_BAR,
    "climbing off one is travelled too",
    `worst frame ${r.getupStep}px of ${MOVE_BAR}${r.gotUp ? "" : " (NEVER GOT UP)"}`);
  check(r.climbDuring.includes("jump") && r.climbDuring.includes("land")
      && r.climbAnims.join(">").includes("jump>land"),
    "...rising, then landing on the stage",
    `${r.climbDuring.length} frame(s): ${r.climbAnims.join(" -> ")}`);
  check(r.rollStep <= MOVE_BAR && r.rollDuring.includes("dodge_roll")
      && r.rollDuring.includes("land"),
    "the ledge roll rolls, then lands",
    `worst frame ${r.rollStep}px of ${MOVE_BAR}, ${r.rollAnims.join(" -> ")}`);
  check(r.attackStep <= MOVE_BAR && r.attackAnims.includes("light"),
    "the ledge attack climbs, then swings",
    `worst frame ${r.attackStep}px of ${MOVE_BAR}, ${r.attackAnims.join(" -> ")}`);
  check(r.jumpStep <= MOVE_BAR,
    "the ledge jump pushes off from the hang instead of being placed above it",
    `worst frame ${r.jumpStep}px`);
  check(r.climbExposedFrames > 0 && r.exposedOnArrival,
    "a getup's intangibility runs out before the getup does",
    `${r.climbExposedFrames} of ${r.climbFrames} climb frames exposed, `
    + `and standing up is${r.exposedOnArrival ? "" : " NOT"} a punish window`);
  check(r.grabInvuln.length === 4 && r.grabInvuln[0] > 0
      && r.grabInvuln[1] < r.grabInvuln[0] && r.grabInvuln[2] < r.grabInvuln[1]
      && r.grabInvuln[3] === 0,
    "ledge intangibility decays on every regrab, and is gone by the fourth",
    r.grabInvuln.join(" -> "));
  check(r.groundedResets === 0,
    "...and touching the ground is the only thing that clears it",
    `ledgeGrabs=${r.groundedResets} after landing`);
  check(r.lungeChar && r.lungeStopped,
    "a special's lunge stops at the lip instead of carrying you off",
    `${r.lungeChar} stopped ${r.lungePast}px past the lip, ${r.lungeLost} stock(s) lost`);
  // A dash attack must not be a stage crossing. 70% of the main platform is
  // generous — the move is meant to travel — and the old `keepMomentum` version
  // cleared the whole platform, light and heavy alike.
  const daBar = Math.round(r.daPlatformW * 0.7);
  check(r.daFired, "the dash attack fixture actually throws all three attacks",
    `light=${r.daLoose?.fired} held=${r.daHeld?.fired} heavy=${r.daHeavy?.fired}`);
  check(r.daFired && r.daLoose.total <= daBar && r.daHeavy.total <= daBar,
    "a dash attack travels a move's distance, not a platform's",
    `light ${r.daLoose?.total}px, heavy ${r.daHeavy?.total}px, bar ${daBar}px `
    + `of a ${r.daPlatformW}px platform`);
  check(r.daFired && r.daLoose.atEnd === 0 && r.daHeavy.atEnd === 0,
    "...and plants when it ends rather than running on",
    `light ended at ${r.daLoose?.atEnd} px/s, heavy at ${r.daHeavy?.atEnd} px/s`);
  check(r.daFired && r.daHeld.atEnd > 0 && r.daHeld.total > r.daLoose.total,
    "...unless the direction is still held, which runs out of it",
    `held ended at ${r.daHeld?.atEnd} px/s and went ${r.daHeld?.total}px `
    + `against ${r.daLoose?.total}px`);
  check(r.lungeHeldLeft,
    "...but lunging with the direction held still goes over",
    `grounded=${!r.lungeHeldLeft}`);
  check(r.teeterAnchor?.name === "teeter" && r.teeterAnchor.axis === "x"
        && Math.abs(r.teeterAnchor.onEdge) < 1,
    "...with its front foot slid onto the platform's own edge",
    `anchor=${JSON.stringify(r.teeterAnchor)}`);
  check(r.teeterAnchorTurned === null,
    "...and not when they have turned their back on the drop",
    `turned=${JSON.stringify(r.teeterAnchorTurned)}`);
  check(r.teeterAnchorBaked, "...off a point measured on the drawing itself");
  check(r.teeterAnim === "teeter" && r.teeterGrounded,
    "stopping on the lip draws the teeter",
    `anim=${r.teeterAnim} dir=${r.teeterDir} grounded=${r.teeterGrounded}`);
} catch (err) {
  check(false, "smoke_ledge ran", err.message);
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} failure(s)` : "\nall ledge checks passed");
process.exit(failures ? 1 : 0);
