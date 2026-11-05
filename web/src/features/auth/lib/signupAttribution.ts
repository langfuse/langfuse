import * as z from "zod";

import { env } from "@/src/env.mjs";

// Ad-platform click ids appended to landing-page URLs by ad clicks. Keys use
// the platforms' canonical URL-param names — the same names PostHog's CDP
// destination templates expect — so event properties map 1:1 in destination
// configuration. `gclid` keeps the name it had in the Google-only
// implementation so the live Google Ads destination mapping keeps working.
type AdClickIds = {
  /** Google Ads */
  gclid?: string;
  /** Google Ads on iOS, sent in place of gclid */
  gbraid?: string;
  /** Google Ads on iOS, sent in place of gclid */
  wbraid?: string;
  /** LinkedIn Ads (first-party ad tracking UUID) */
  li_fat_id?: string;
  /** Reddit Ads */
  rdt_cid?: string;
  /** X (Twitter) Ads — captured for future use, PostHog has no X destination */
  twclid?: string;
};

/** Where a new user's first visit came from, as `cloud_signup_complete` properties */
export type SignupSource = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  /** host of the first visit's referrer */
  signup_referrer?: string;
  signup_landing_host?: string;
  /**
   * path of the first visit's landing page, without its query string; on an
   * app host, its section with ids replaced (`/project/[projectId]/traces/*`)
   */
  signup_landing_path?: string;
};

export type SignupAttribution = {
  /** sign-up method: a NextAuth provider id, `sso`, `email` or `credentials` */
  provider?: string;
  adClickIds?: AdClickIds;
  signupSource?: SignupSource;
};

const CLICK_ID_PARAMS = [
  "gclid",
  "gbraid",
  "wbraid",
  "li_fat_id",
  "rdt_cid",
  "twclid",
] as const satisfies readonly (keyof AdClickIds)[];

// click ids are opaque tokens (typically ~60-120 chars); cap length and
// charset to avoid persisting arbitrary user-controlled strings into
// analytics events
const MAX_CLICK_ID_LENGTH = 512;
const CLICK_ID_FORMAT = /^[A-Za-z0-9_.-]+$/;

const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const satisfies readonly (keyof SignupSource)[];

// utm values are free text chosen by whoever wrote the link: allow what
// campaign names use, but nothing that can hold an email address
const MAX_SOURCE_VALUE_LENGTH = 256;
const UTM_VALUE_FORMAT = /^[A-Za-z0-9 _.+|:(),/-]+$/;

// posthog-js persistence cookie, named after the project api key
const POSTHOG_COOKIE_NAME = /^ph_phc_[A-Za-z0-9]+_posthog$/;

// The part of the posthog-js persistence cookie read here: `u` is the URL of
// the visitor's first-ever pageview, `r` its referrer (`$direct` if none).
const PosthogCookieSchema = z.object({
  $initial_person_info: z.object({ u: z.string(), r: z.string().optional() }),
});

type FirstVisit = { landingUrl: URL; referrer?: string };

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

function parsePosthogFirstVisit(
  cookieValue: string | undefined,
): FirstVisit | undefined {
  if (!cookieValue) return undefined;
  try {
    const cookie = PosthogCookieSchema.safeParse(JSON.parse(cookieValue));
    if (!cookie.success) return undefined;
    const { u, r } = cookie.data.$initial_person_info;
    return { landingUrl: new URL(u), referrer: r };
  } catch {
    // malformed cookie — attribution is best-effort, ignore
    return undefined;
  }
}

/**
 * The first visit from a posthog-js cookie: the first readable one that isn't
 * the app's own, else the app's.
 */
function getPosthogFirstVisit(req: RequestWithCookies): FirstVisit | undefined {
  const appCookieName = env.NEXT_PUBLIC_POSTHOG_KEY
    ? `ph_${env.NEXT_PUBLIC_POSTHOG_KEY}_posthog`
    : undefined;
  const firstVisits = Object.entries(req.cookies).flatMap(([name, value]) => {
    if (!POSTHOG_COOKIE_NAME.test(name)) return [];
    const firstVisit = parsePosthogFirstVisit(value);
    return firstVisit
      ? [{ isAppCookie: name === appCookieName, firstVisit }]
      : [];
  });
  return (firstVisits.find(({ isAppCookie }) => !isAppCookie) ?? firstVisits[0])
    ?.firstVisit;
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
    // read from lf_* cookies and the landing URL only
    case "gbraid":
    case "wbraid":
      return undefined;
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
 * 3. The click-id param in the PostHog cookie's first-touch URL, e.g. when
 *    ad consent was not given so the platform pixels never ran.
 *
 * Only ids that resolved are present in the returned object, so it can be
 * spread straight into event properties.
 */
export function getAdClickIdsFromRequest(req: RequestWithCookies): AdClickIds {
  const firstTouchUrl = getPosthogFirstVisit(req)?.landingUrl;
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

function sanitizeUtmValue(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_SOURCE_VALUE_LENGTH ||
    !UTM_VALUE_FORMAT.test(trimmed)
  )
    return undefined;
  return trimmed;
}

function getUtmParams(landingUrl: URL): SignupSource {
  const utmParams: SignupSource = {};
  for (const param of UTM_PARAMS) {
    const value = sanitizeUtmValue(landingUrl.searchParams.get(param));
    if (value) utmParams[param] = value;
  }
  return utmParams;
}

// host only: the rest of the referring URL belongs to another site
function getReferrerHost(referrer: string | undefined): SignupSource {
  if (!referrer || !URL.canParse(referrer)) return {};
  const { host } = new URL(referrer);
  return host && host.length <= MAX_SOURCE_VALUE_LENGTH
    ? { signup_referrer: host }
    : {};
}

function getLandingHost(landingUrl: URL): SignupSource {
  const { host } = landingUrl;
  return host && host.length <= MAX_SOURCE_VALUE_LENGTH
    ? { signup_landing_host: host }
    : {};
}

const WEBSITE_HOST = "langfuse.com";

/** `i18n.locales` in `next.config.mjs`: Next.js serves `/en/…` as the page without that segment */
export const LOCALES: readonly string[] = ["en"];

// The app's first segments followed by an id: the id's name, and how many
// segments are kept (the section after the id, where pages have one)
const ID_PATHS: Partial<Record<string, { idName: string; kept: number }>> = {
  project: { idName: "[projectId]", kept: 3 },
  organization: { idName: "[organizationId]", kept: 3 },
  trace: { idName: "[traceId]", kept: 2 },
};

// A path with an `@`, plain or percent-encoded, may hold an email address:
// dropped.
const EMAIL_SIGN = /@|%40/i;

// a leading locale, in any case, as Next.js detects one
function withoutLocale(segments: string[]): string[] {
  const [first, ...rest] = segments;
  const isLocale = LOCALES.some(
    (locale) => locale.toLowerCase() === first?.toLowerCase(),
  );
  return isLocale ? rest : segments;
}

function keepSection(segments: string[]): string[] {
  const [first, second, ...rest] = segments;
  const idPath = first ? ID_PATHS[first.toLowerCase()] : undefined;
  if (!first || !idPath || second === undefined) return segments.slice(0, 2);
  return [first.toLowerCase(), idPath.idName, ...rest].slice(0, idPath.kept);
}

/** An app path cut to its section, ids replaced, `/*` where segments were dropped: `/project/[projectId]/prompts/*` */
function getAppSection(pathname: string): string {
  const segments = withoutLocale(
    pathname.split("/").filter((segment) => segment.length > 0),
  );
  const kept = keepSection(segments);
  const cut = segments.length > kept.length ? "/*" : "";
  return `/${kept.join("/")}${cut}`;
}

// path only: a query string can carry tokens or personal data. Any host but
// the website is the app, whose paths hold customers' ids and names.
function getLandingPath(landingUrl: URL): SignupSource {
  const path =
    landingUrl.hostname === WEBSITE_HOST
      ? landingUrl.pathname
      : getAppSection(landingUrl.pathname);
  return path.length <= MAX_SOURCE_VALUE_LENGTH && !EMAIL_SIGN.test(path)
    ? { signup_landing_path: path }
    : {};
}

/**
 * The first visit's source, only the fields that resolved; `{}` without a
 * readable cookie.
 */
export function getSignupSourceFromRequest(
  req: RequestWithCookies,
): SignupSource {
  const firstVisit = getPosthogFirstVisit(req);
  if (!firstVisit) return {};
  return {
    ...getUtmParams(firstVisit.landingUrl),
    ...getReferrerHost(firstVisit.referrer),
    ...getLandingHost(firstVisit.landingUrl),
    ...getLandingPath(firstVisit.landingUrl),
  };
}

/**
 * A sign-up's provider for events: multi-tenant SSO ids
 * (`<domain>.<provider>`) become `sso`, so no customer domain reaches one.
 */
export function getSignupProvider(providerId: string) {
  return providerId.includes(".") ? "sso" : providerId;
}

export function getSignupAttributionFromRequest(
  req: RequestWithCookies,
  providerId: string | undefined,
): SignupAttribution {
  return {
    provider: providerId && getSignupProvider(providerId),
    adClickIds: getAdClickIdsFromRequest(req),
    signupSource: getSignupSourceFromRequest(req),
  };
}
