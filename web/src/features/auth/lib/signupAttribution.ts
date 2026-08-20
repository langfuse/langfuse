// Ad-platform click ids appended to landing-page URLs by ad clicks. Keys use
// the platforms' canonical parameter names (also used by PostHog's campaign
// params and CDP destination templates) so they map 1:1 in destination
// configuration.
export type AdClickIds = {
  /** Google Ads */
  gclid?: string;
  /** LinkedIn Ads (first-party ad tracking UUID) */
  li_fat_id?: string;
  /** Reddit Ads */
  rdt_cid?: string;
  /** X (Twitter) Ads */
  twclid?: string;
};

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

// PostHog persistence cookie stores the URL of the visitor's first-ever
// pageview under $initial_person_info.u — a first-touch fallback source for
// all click ids, e.g. when ad-consent was not given so the platform pixels
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

/**
 * Extracts the ad-platform click ids of the ad click that led this browser to
 * Langfuse, if any. Used to attribute `cloud_signup_complete` events to ad
 * campaigns (uploaded to the ad platforms via PostHog CDP destinations).
 *
 * All sources are first-party cookies on `.langfuse.com`, so they are sent
 * along with every request to the cloud app regardless of which page the ad
 * click originally landed on (usually the langfuse.com marketing site).
 * Per click id, in priority order:
 *
 * 1. `lf_<param>` — set by langfuse.com on every landing with the platform's
 *    click-id URL param (last ad click wins).
 * 2. The platform pixel's own first-party cookie, where one exists
 *    (Google gtag: `_gcl_aw`, LinkedIn Insight Tag: `li_fat_id`,
 *    Reddit Pixel: `_rdt_cid`) — only present when the visitor consented to
 *    ad cookies on langfuse.com.
 * 3. The click-id param in the PostHog cookie's first-touch URL.
 *
 * Only defined ids are included in the returned object, so it can be spread
 * directly into event properties.
 */
export function getAdClickIdsFromRequest(req: RequestWithCookies): AdClickIds {
  const firstTouchUrl = getFirstTouchUrl(req);

  const resolve = (
    param: keyof AdClickIds,
    platformCookieValue?: string,
  ): string | undefined =>
    sanitizeClickId(req.cookies[`lf_${param}`]) ??
    sanitizeClickId(platformCookieValue) ??
    sanitizeClickId(firstTouchUrl?.searchParams.get(param));

  const ids: AdClickIds = {
    // Google conversion-linker cookie: GCL.<timestamp>.<gclid>
    gclid: resolve(
      "gclid",
      req.cookies["_gcl_aw"]?.split(".").slice(2).join("."),
    ),
    li_fat_id: resolve("li_fat_id", req.cookies["li_fat_id"]),
    rdt_cid: resolve("rdt_cid", req.cookies["_rdt_cid"]),
    twclid: resolve("twclid"),
  };

  return Object.fromEntries(
    Object.entries(ids).filter(([, value]) => value !== undefined),
  );
}
