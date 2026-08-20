// The one value that turns visitor stats on, and the only one worth editing.
//
// The site is static — GitHub Pages serves the repo root and runs nothing, so
// there is no request log to read and no place to write one. Counting visits
// therefore has to happen in the visitor's browser, against something that is
// not Pages. That something is GoatCounter (https://www.goatcounter.com), an
// open-source counter with a free hosted tier.
//
// Setup, once, about five minutes:
//
//   1. Register a site at https://www.goatcounter.com/signup. The "code" you
//      pick becomes the subdomain: code `jjkbrawler` gives you the dashboard
//      https://jjkbrawler.goatcounter.com.
//   2. Put that code below.
//   3. In GoatCounter's Settings → "Sites that can embed GoatCounter", add
//      `hoai2k.github.io` so /stats/ can show the dashboard inline.
//   4. Push. The next deploy starts counting.
//
// Empty is the honest default: nothing is sent, /stats/ says so and repeats
// these steps, and nobody has to trust a subdomain this repo does not own.
// Left as a bare code rather than a full URL because a full URL is the thing
// people paste by mistake, and half a URL glued to "/count" fails silently —
// so `countEndpoint()` below refuses anything that is not a code.
export const GOATCOUNTER_SITE = "";

/** Is a code shaped like one GoatCounter would have issued?
 *
 *  Their codes are lowercase alphanumeric with hyphens. Anything else is a
 *  paste accident — most often the whole `https://x.goatcounter.com/count`
 *  URL, which would otherwise be concatenated into a nonsense endpoint that
 *  404s once per pageview with nothing on screen to say why. */
export function isValidSite(code) {
  return typeof code === "string" && /^[a-z0-9][a-z0-9-]{0,49}$/.test(code);
}

/** Where count.js sends a pageview. Null when unconfigured or malformed. */
export function countEndpoint(code = GOATCOUNTER_SITE) {
  if (!code) return null;
  if (!isValidSite(code)) {
    console.error(
      `[stats] GOATCOUNTER_SITE is "${code}", which is not a GoatCounter code. ` +
      `Use the bare code — "jjkbrawler", not "https://jjkbrawler.goatcounter.com". ` +
      `See src/config_stats.js.`);
    return null;
  }
  return `https://${code}.goatcounter.com/count`;
}

/** The dashboard for a code, for /stats/ to frame and link to. */
export function dashboardUrl(code = GOATCOUNTER_SITE) {
  return isValidSite(code) ? `https://${code}.goatcounter.com` : null;
}
