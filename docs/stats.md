# Visitor stats

**Where:** [/stats/](../stats/index.html) on the published site —
https://hoai2k.github.io/jjkbrawler/stats/

**Question it answers:** is anyone I don't know playing this, and where are they?

## Why it works this way

GitHub Pages serves the repo root and runs nothing. There is no request handler
to log a visit and no log to read one back from, so the only place a count can
originate is the visitor's browser, and the only place it can be stored is
somewhere that is not Pages.

That somewhere is [GoatCounter](https://www.goatcounter.com), an open-source
counter with a free hosted tier. `src/stats.js` appends its `count.js` to the
game page; `stats/index.html` frames and links the dashboard it produces. Three
files and no build step, which is the whole reason it was chosen over running
our own collector: a Cloudflare Worker with a KV store would give richer,
game-specific numbers, but it is a second deployment to keep alive for a
question that a counter already answers.

## Switching it on

1. Register a site at [goatcounter.com/signup](https://www.goatcounter.com/signup).
   The **code** you pick becomes the dashboard subdomain — code `jjkbrawler`
   gives `https://jjkbrawler.goatcounter.com`.
2. Put the bare code in [`src/config_stats.js`](../src/config_stats.js):
   `export const GOATCOUNTER_SITE = "jjkbrawler";`. The bare code, not the URL —
   a pasted URL is refused with a console error rather than silently 404ing once
   per visit.
3. In GoatCounter, **Settings → Sites that can embed GoatCounter**, add
   `hoai2k.github.io`. Without this the dashboard still works at its own
   address; only the frame on /stats/ goes blank.
4. Merge to `main`. The next Pages deploy starts counting.

Until step 2 is done, nothing is sent anywhere and /stats/ shows these steps
instead of a dashboard — deliberately, because an empty dashboard would read as
"nobody has ever played it", which is a different and much more interesting
claim than "we have not been counting".

## What it records

Per visit: country (derived from the IP and then discarded), referrer, browser,
operating system, screen width, language, page and time. Not recorded: IP
addresses, the full User-Agent, any tracker ID, and any cookie — theirs or ours,
which is why there is no consent banner. GoatCounter's
[privacy page](https://www.goatcounter.com/help/privacy) is the authority here,
not this paragraph.

Nothing from inside the game is recorded: no characters picked, no matches
played, no session length. That needs a collector we control, and it is the
reason to revisit the Worker option if the interesting question ever becomes
"what do they play" rather than "who are they".

## Reading it honestly

- **Local play is not counted.** `count.js` skips `localhost`, private
  addresses and `file://`, so the dashboard is other people rather than you
  testing a stage forty times. That also means `npm start` can never be used to
  check that counting works — only the deployed site can.
- **It undercounts.** Ad blockers block `gc.zgo.at`, and that visit goes
  unrecorded with no sign on either end. Treat every number as a floor.
- **There is no history before switch-on.** Pages kept no log, so there is
  nothing to backfill from. Day one is the day the code lands.
- **Country is coarse and occasionally wrong.** It comes from an IP database;
  a VPN reports wherever the exit node is.

## Checking it still works

```
node server.mjs
node tools/smoke_stats.mjs
```

Asserts the part that can rot without showing: that the off state says it is
off, that a configured code reaches the right endpoint, and that a pasted URL
is refused. It temporarily edits `src/config_stats.js` and puts it back, and it
intercepts every request to `gc.zgo.at` — a test run must never land pageviews
in a real dashboard.
