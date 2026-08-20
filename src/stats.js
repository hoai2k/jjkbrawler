// Count a pageview, and nothing more than a pageview.
//
// The question this exists to answer is "is anyone I don't know playing this?",
// which needs three facts per visit — roughly where it came from, what linked
// it, and what it was played on — and no fourth. So this loads GoatCounter's
// counter and stops there: no identifiers of our own, no per-player events, no
// telemetry hooks into the game loop. What GoatCounter records for us is on its
// own privacy page (https://www.goatcounter.com/help/privacy) and is
// deliberately thin: country from the IP, referrer, browser, OS, screen width,
// language. It stores no IP addresses, no full User-Agent and no tracker ID,
// and it sets no cookies, so there is no consent banner to add.
//
// Failure here must never cost a frame of the game. The script is appended
// async and its errors are swallowed: an ad blocker eating gc.zgo.at is the
// common case (GoatCounter's own docs lead with it), the visit simply goes
// uncounted, and the player never learns that anything was meant to happen.
//
// Local play is not counted. count.js skips localhost, 127.x, 10.x, 192.168.x
// and file:// on its own, which is what you want — the dashboard should be
// strangers, not you testing a stage forty times.

import { GOATCOUNTER_SITE, countEndpoint } from "./config_stats.js";

const COUNT_JS = "https://gc.zgo.at/count.js";

/** Attach the counter. Safe to call on a page that is not configured for it. */
export function installStats() {
  const endpoint = countEndpoint(GOATCOUNTER_SITE);
  if (!endpoint) {
    // Quiet on a dev machine — there is nothing wrong with a local page not
    // counting. Loud on the published site, because there "no visitors ever"
    // and "the counter was never switched on" look identical from /stats/,
    // and this is the only place that can tell them apart.
    if (!/^(localhost|127\.|\[?::1)/.test(location.hostname) && location.protocol !== "file:") {
      console.info("[stats] visitor stats are off — set GOATCOUNTER_SITE in src/config_stats.js");
    }
    return;
  }

  const tag = document.createElement("script");
  tag.async = true;
  tag.src = COUNT_JS;
  tag.dataset.goatcounter = endpoint;
  tag.addEventListener("error", () => {
    console.info("[stats] counter blocked or unreachable — this visit went uncounted");
  });
  document.head.append(tag);
}

installStats();
