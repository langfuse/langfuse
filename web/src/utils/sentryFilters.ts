import { type ErrorEvent } from "@sentry/nextjs";

/**
 * High-frequency poll / health endpoints whose transient 5xx responses are
 * expected background noise rather than actionable client-side errors.
 *
 * `Sentry.httpClientIntegration()` reports EVERY 5xx fetch/XHR the browser
 * observes as an unhandled `HTTP Client Error with status code: N`. The worst
 * offender by far is NextAuth's session poll: `SessionProvider` in `_app.tsx`
 * refetches `/api/auth/session` every 5 minutes AND on every window focus, for
 * every signed-in user. Its callback runs a heavy nested Prisma query, so any
 * transient DB blip, slow response, or pod restart momentarily 5xxes here and is
 * amplified across thousands of browsers into huge false-positive Sentry issues.
 *
 * Matched by URL path SUFFIX so an optional `NEXT_PUBLIC_BASE_PATH` prefix
 * (e.g. `/self-hosted/api/auth/session`) still matches.
 */
export const HTTP_CLIENT_NOISE_PATHS = [
  "/api/auth/session", // NextAuth session poll (5-min interval + on window focus)
  // The two probes below are defensive/inert: they are only fetched by infra
  // liveness/readiness checks, never by the browser, so they cannot actually
  // match a client-side httpClient event. Only /api/auth/session suppresses
  // real browser noise today; the probes are listed to be safe if a browser
  // ever starts polling them.
  "/api/public/health", // liveness probe (infra-only)
  "/api/public/ready", // readiness probe (infra-only)
] as const;

/**
 * True only for events created by `httpClientIntegration` (exception mechanism
 * `auto.http.client.fetch` / `auto.http.client.xhr`) whose request URL targets
 * one of the poll/health endpoints in {@link HTTP_CLIENT_NOISE_PATHS}.
 *
 * Deliberately narrow. It keys on the Sentry-set exception mechanism, so it can
 * never drop:
 *  - a genuine thrown exception or a captured console error (different / no
 *    mechanism), or
 *  - a 5xx on any real API/tRPC endpoint — e.g. `/api/trpc/...`,
 *    `/api/public/traces`, `/api/public/ingestion` — those are not in the noise
 *    list and keep flowing to Sentry.
 *
 * This does not hide real outages: a genuine `/api/auth/session` 5xx is still
 * observable server-side via request tracing/APM spans and application logs, and
 * via the health-check system — and the frontend already treats the session poll
 * as non-fatal. This filter only removes the redundant client-side amplification
 * of that same failure across thousands of browsers.
 */
export function isNoisyHttpClientPollEvent(event: ErrorEvent): boolean {
  const mechanismType = event.exception?.values?.[0]?.mechanism?.type;
  const isHttpClientEvent =
    typeof mechanismType === "string" &&
    mechanismType.startsWith("auto.http.client");
  if (!isHttpClientEvent) return false;

  const requestUrl = event.request?.url;
  if (typeof requestUrl !== "string") return false;

  // Reduce to a path so origin/query string don't affect matching. Fall back to
  // the raw string if the URL cannot be parsed (httpClient URLs are absolute, so
  // this is effectively unreachable, but we stay defensive).
  let path = requestUrl;
  try {
    path = new URL(requestUrl, "http://localhost").pathname;
  } catch {
    // keep raw requestUrl
  }

  return HTTP_CLIENT_NOISE_PATHS.some((noisePath) => path.endsWith(noisePath));
}
