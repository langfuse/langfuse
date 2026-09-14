// Ad-platform click ids appended to landing-page URLs by ad clicks. Keys use
// the platforms' canonical URL-param names — the same names PostHog's CDP
// destination templates expect — so event properties map 1:1 in destination
// configuration. `gclid` keeps the name it had in the Google-only
// implementation so the live Google Ads destination mapping keeps working.
export type AdClickIds = {
  /** Google Ads */
  gclid?: string;
  /** LinkedIn Ads (first-party ad tracking UUID) */
  li_fat_id?: string;
  /** Reddit Ads */
  rdt_cid?: string;
  /** X (Twitter) Ads — captured for future use, PostHog has no X destination */
  twclid?: string;
};

const CLICK_ID_PARAMS = [
  "gclid",
  "li_fat_id",
  "rdt_cid",
  "twclid",
] as const satisfies readonly (keyof AdClickIds)[];

// click ids are opaque tokens (typically ~60-120 chars); cap length and
// charset to avoid persisting arbitrary user-controlled strings into
// analytics events
const MAX_CLICK_ID_LENGTH = 512;
const CLICK_ID_FORMAT = /^[A-Za-z0-9_.-]+$/;

// posthog-js persistence cookie, named after the project api key
const POSTHOG_COOKIE_NAME = /^ph_phc_[A-Za-z0-9]+_posthog$/;

type RequestWithCookies = {
  cookies: Partial<Record<string, string>>;
};

function sanitizeClickId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_CLICK_ID_LENGTH ||
    !CLICK_ID_FORMAT.test(trimmed)
  )
    return undefined;
  return trimmed;
}

// The PostHog persistence cookie stores the URL of the visitor's first-ever
// pageview under `$initial_person_info.u` — a first-touch fallback source for
// every click id, e.g. when ad consent was not given so the platform pixels
// never ran.
function getFirstTouchUrl(req: RequestWithCookies): URL | undefined {
  const posthogCookie = Object.entries(req.cookies).find(([name]) =>
    POSTHOG_COOKIE_NAME.test(name),
  )?.[1];
  if (!posthogCookie) return undefined;
  try {
    const parsed: unknown = JSON.parse(posthogCookie);
    const initialUrl =
      typeof parsed === "object" &&
      parsed !== null &&
      "$initial_person_info" in parsed &&
      typeof parsed.$initial_person_info === "object" &&
      parsed.$initial_person_info !== null &&
      "u" in parsed.$initial_person_info &&
      typeof parsed.$initial_person_info.u === "string"
        ? parsed.$initial_person_info.u
        : undefined;
    return initialUrl ? new URL(initialUrl) : undefined;
  } catch {
    // malformed cookie — attribution is best-effort, ignore
    return undefined;
  }
}

// The ad platforms' own first-party cookies, where the pixel sets one. Only
// present when the visitor consented to advertisement cookies on
// langfuse.com and the pixel was not blocked.
function getPlatformCookieValue(
  req: RequestWithCookies,
  param: keyof AdClickIds,
): string | undefined {
  switch (param) {
    // Google conversion linker (gtag.js), format `GCL.<timestamp>.<gclid>`
    case "gclid":
      return req.cookies["_gcl_aw"]?.split(".").slice(2).join(".");
    // LinkedIn Insight Tag stores the click id under its own param name
    case "li_fat_id":
      return req.cookies["li_fat_id"];
    // Reddit Pixel
    case "rdt_cid":
      return req.cookies["_rdt_cid"];
    // X's pixel does not persist twclid in a readable first-party cookie
    case "twclid":
      return undefined;
  }
}

/**
 * Extracts the ad-platform click ids of the ad click that led this browser to
 * Langfuse, if any. Used to attribute `cloud_signup_complete` events to ad
 * campaigns, which PostHog CDP destinations upload to Google Ads, LinkedIn
 * Ads, and Reddit Ads as conversions.
 *
 * All sources are first-party cookies on `.langfuse.com`, so they are sent
 * along with every request to the cloud app regardless of which page the ad
 * click originally landed on (usually the langfuse.com marketing site). Per
 * click id, in priority order:
 *
 * 1. `lf_<param>` — set by langfuse.com on every landing with that platform's
 *    click-id param (last ad click wins).
 * 2. The platform pixel's own first-party cookie, where it sets one.
 * 3. The click-id param in the PostHog cookie's first-touch URL.
 *
 * Only ids that resolved are present in the returned object, so it can be
 * spread straight into event properties.
 */
export function getAdClickIdsFromRequest(req: RequestWithCookies): AdClickIds {
  const firstTouchUrl = getFirstTouchUrl(req);
  const clickIds: AdClickIds = {};

  for (const param of CLICK_ID_PARAMS) {
    const value =
      sanitizeClickId(req.cookies[`lf_${param}`]) ??
      sanitizeClickId(getPlatformCookieValue(req, param)) ??
      sanitizeClickId(firstTouchUrl?.searchParams.get(param));
    if (value) clickIds[param] = value;
  }

  return clickIds;
}
