// gclids are opaque tokens (typically ~60-120 chars); cap length and charset to
// avoid persisting arbitrary user-controlled strings into analytics events
const MAX_GCLID_LENGTH = 512;
const GCLID_FORMAT = /^[A-Za-z0-9_-]+$/;

// posthog-js persistence cookie, named after the project api key
const POSTHOG_COOKIE_NAME = /^ph_phc_[A-Za-z0-9]+_posthog$/;

type RequestWithCookies = {
  cookies: Partial<Record<string, string>>;
};

function sanitizeGclid(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_GCLID_LENGTH ||
    !GCLID_FORMAT.test(trimmed)
  )
    return undefined;
  return trimmed;
}

/**
 * Extracts the Google Ads click id (gclid) of the ad click that led this
 * browser to Langfuse, if any. Used to attribute `cloud_signup_complete`
 * events to Google Ads campaigns (uploaded via a PostHog CDP destination).
 *
 * All sources are first-party cookies on `.langfuse.com`, so they are sent
 * along with every request to the cloud app regardless of which page the ad
 * click originally landed on (usually the langfuse.com marketing site):
 *
 * 1. `lf_gclid` — set by langfuse.com on every landing with a `?gclid=` param
 *    (last ad click wins).
 * 2. `_gcl_aw` — Google's own conversion-linker cookie set by gtag.js on
 *    langfuse.com, format `GCL.<timestamp>.<gclid>`.
 * 3. The PostHog cookie's `$initial_person_info.u` (the URL of the visitor's
 *    first-ever pageview) — first-touch fallback, e.g. when ad-consent was
 *    not given so gtag never ran.
 */
export function getGclidFromRequest(
  req: RequestWithCookies,
): string | undefined {
  // 1. dedicated first-party cookie set by the marketing site
  const fromDedicatedCookie = sanitizeGclid(req.cookies["lf_gclid"]);
  if (fromDedicatedCookie) return fromDedicatedCookie;

  // 2. Google conversion-linker cookie: GCL.<timestamp>.<gclid>
  const gclAw = req.cookies["_gcl_aw"];
  if (gclAw) {
    const fromGclAw = sanitizeGclid(gclAw.split(".").slice(2).join("."));
    if (fromGclAw) return fromGclAw;
  }

  // 3. PostHog persistence cookie: first-touch URL may contain the gclid
  const posthogCookie = Object.entries(req.cookies).find(([name]) =>
    POSTHOG_COOKIE_NAME.test(name),
  )?.[1];
  if (posthogCookie) {
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
      if (initialUrl) {
        return sanitizeGclid(new URL(initialUrl).searchParams.get("gclid"));
      }
    } catch {
      // malformed cookie — attribution is best-effort, ignore
    }
  }

  return undefined;
}
