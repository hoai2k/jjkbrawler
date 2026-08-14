// The workbench hub. `/workbench/?edit=<mode>` reaches ANY bench in the repo.
//
// There are four benches and they live in four places — `/sprites/workbench/`,
// `/billboards/workbench/`, `/render3d/workbench/` and this one — because each
// sits beside the code it drives. That is right for the code and useless for
// the fingers: nobody remembers which directory the joint-reads editor is under.
//
// So one address does the lot. `/workbench/?edit=animation` lands on the
// keyframe bench, `/workbench/?edit=actions` on the action bench, and the
// modes each bench already answers to keep their own spellings — this adds a
// front door, it does not rename the rooms.
//
// A classic script, in the head, on purpose: it runs while the document is
// still parsing, so a redirect happens before the audio bench's modules are
// executed and nothing is loaded for a page nobody is going to look at.

(function () {
  // The cache key for this bench's own files, and for every module they import.
  //
  // GitHub Pages serves HTML, CSS and JS with a ten-minute max-age, and a
  // browser may keep an ES module in a tab's memory cache with no revalidation
  // at all — so "I edited the bench and reloaded" can mean "the bench did not
  // change", for longer than anyone is willing to wait. A different URL is the
  // one thing no cache argues with.
  //
  // BUMP THIS WHENEVER THE BENCH CHANGES.
  var BENCH_VERSION = "3";
  if (document.currentScript) document.currentScript.dataset.version = BENCH_VERSION;
  // Where each mode lives. Paths are RELATIVE, so the whole thing keeps working
  // under a subdirectory — the GitHub Pages build serves this at
  // /jjkbrawler/workbench/ and absolute paths would walk out of the project.
  var ROUTES = {
    // The bench that lives here. Not a redirect: this is the page you are on.
    audio: null,
    sprites: "../sprites/workbench/",
    actions: "../sprites/workbench/?edit=actions",
    billboards: "../billboards/workbench/",
    "3d": "../render3d/workbench/",
    animation: "../render3d/workbench/?edit=animation",
    pose: "../render3d/workbench/?edit=pose",
    reads: "../render3d/workbench/?edit=reads",
    models: "../render3d/workbench/?edit=models",
  };

  // Spellings people will actually type, in the spirit of the render backend's
  // alias table: naming a thing plainly should never cost you a wrong turn.
  var ALIASES = {
    voice: "audio", voices: "audio", sound: "audio", sfx: "audio",
    sprite: "sprites", "2d": "sprites",
    action: "actions",
    billboard: "billboards", "2.5d": "billboards",
    render3d: "3d", anime: "3d",
    // "model" belongs to the MODEL bench, which is the one that edits models.
    // It used to point at the pose bench, which does not.
    model: "models", rig: "models", rigs: "models", bones: "models",
    anim: "animation", keyframes: "animation", clip: "animation", clips: "animation",
    joints: "reads", "joint-reads": "reads", read: "reads",
  };

  var here = new URL(window.location.href);
  var asked = (here.searchParams.get("edit") || "audio").toLowerCase();
  var mode = ALIASES[asked] || asked;

  if (mode === "audio") return;

  if (!(mode in ROUTES)) {
    // Same bargain `?render=` strikes: an unknown mode opens something rather
    // than nothing, and says what it would have accepted. The page lists the
    // modes too, so the right spelling is one glance away.
    console.warn(
      'workbench: no bench called "' + asked + '" — staying on the audio bench. '
      + "Known modes: " + Object.keys(ROUTES).concat(Object.keys(ALIASES)).join(", ")
    );
    document.documentElement.dataset.unknownMode = asked;
    return;
  }

  // Everything else the caller passed travels with them — `?edit=pose&char=gojo`
  // is a deep link to a fighter's joint reads, and losing the fighter on the way
  // would make the shortcut worse than typing the path. A param the route sets
  // itself wins, so `edit` is dropped here rather than overwriting the target's.
  var target = new URL(ROUTES[mode], window.location.href);
  here.searchParams.forEach(function (value, key) {
    if (key !== "edit" && !target.searchParams.has(key)) target.searchParams.set(key, value);
  });

  // replace(), not assign(): the hub is a doorway, and leaving it in the history
  // would make Back bounce off it straight back to where you just left.
  window.location.replace(target.href);
})();

// The bench's own assets, keyed so a stale copy cannot survive a reload.
//
// `?bust=<anything>` on the page URL wins over the baked-in version, which is
// what the Refresh button in the header uses: it navigates to a URL nobody has
// ever fetched, so the HTML misses the cache, and the token it carries then
// makes the stylesheet, the module and everything the module imports miss too.
// Read from the LIVE url rather than from this file, so it works even when this
// file is itself the stale copy.
(function () {
  var version = document.currentScript && document.currentScript.dataset.version;
  var bust = new URL(window.location.href).searchParams.get("bust");
  var key = bust || version || "0";
  window.__benchCacheKey = key;

  var css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "workbench.css?v=" + encodeURIComponent(key);
  document.head.appendChild(css);

  // Module scripts are deferred whether they are parsed or injected, so
  // appending here runs it after the document is parsed, exactly as a tag at
  // the end of the body would have.
  var js = document.createElement("script");
  js.type = "module";
  js.src = "audio.js?v=" + encodeURIComponent(key);
  document.head.appendChild(js);
})();
