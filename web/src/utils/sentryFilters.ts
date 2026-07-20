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

/**
 * Browser/transport messages that mean the client could not complete a network
 * request at the transport layer: offline, flaky wifi, a throttled/backgrounded
 * tab, a CORS rejection, or a proxy/infra 5xx that returned an HTML page. Each
 * is just one engine's name for "the fetch never completed" — none is Langfuse
 * application logic.
 *
 * Matched as the WHOLE (normalized) exception message, never as a substring: a
 * genuine failure does not surface as one of these bare strings. Real API
 * failures surface server-side (request tracing / logs) and, on the client, as
 * a *handled* error carrying the server's real message (e.g. `UNAUTHORIZED`).
 * App code that merely quotes a phrase — e.g. `Failed to fetch created model`,
 * `Failed to fetch channels. Please check your Slack connection` — is longer
 * than the bare string and is therefore KEPT. See the negative fixtures in
 * `sentryFilters.clienttest.ts`.
 */
const TRANSPORT_FAILURE_MESSAGES: readonly string[] = [
  "Failed to fetch", // Chrome / Chromium fetch network failure
  "NetworkError when attempting to fetch resource", // Firefox fetch network failure
  "Load failed", // Safari / WebKit fetch network failure
];

/**
 * Message prefixes emitted by non-Langfuse code (framework / vendor). These are
 * unambiguous, vendor-namespaced strings that our own code cannot produce, so
 * matching them by prefix cannot swallow a real app error.
 */
const NOISE_MESSAGE_PREFIXES: readonly string[] = [
  // NextAuth's client `SessionProvider` logs this via `console.error` (picked up
  // by `captureConsoleIntegration`) when its 5-min / on-focus session poll fails
  // transiently — same transient root as the httpClient poll already filtered by
  // `isNoisyHttpClientPollEvent`. The `[next-auth]` namespace can only come from
  // the library, never from app code.
  "[next-auth][error][CLIENT_FETCH_ERROR]",
  // PostHog analytics SDK notices / client-side rate-limit logs. Third-party.
  "[PostHog.js]",
  // `Response.json()` on a non-JSON body (a 5xx / HTML proxy page returned where
  // JSON was expected). This is the response not being ours-as-JSON, i.e. a
  // transport/infra artifact, not app logic.
  "Failed to execute 'json' on 'Response'",
  // `@sentry/nextjs`'s own pages-router `_error` instrumentation calls
  // `captureException(err || `_error.js called with falsy error (${err})`)`, so
  // the fallback message always STARTS with this literal (`(undefined)`,
  // `(null)`, ...). It is a framework artifact with no real error attached.
  "_error.js called with falsy error",
];

/**
 * A `TRPCClientError` re-wraps its cause's message. Depending on capture path
 * the Sentry `value` may be the bare cause message (`Failed to fetch`) or carry
 * the wrapper prefix (`TRPCClientError: Failed to fetch`). We strip ONLY this
 * one known wrapper prefix and match the inner phrase, because the raw
 * `TRPCClientError:` prefix also fronts real, must-keep errors.
 */
const TRPC_CLIENT_ERROR_PREFIX = "TRPCClientError: ";

function coreMessage(value: string): string {
  const withoutWrapper = value.startsWith(TRPC_CLIENT_ERROR_PREFIX)
    ? value.slice(TRPC_CLIENT_ERROR_PREFIX.length)
    : value;
  // Strip engine-specific decorations so the whole-message comparison stays
  // exact yet engine-agnostic:
  //  - a trailing ` (host)` parenthetical Chrome appends, e.g.
  //    `Failed to fetch (cloud.langfuse.com)` -> `Failed to fetch`;
  //  - a single trailing period Firefox appends to its transport message.
  // Only a WHOLE trailing parenthetical/period is removed, so a real app error
  // that merely quotes a phrase (`Failed to fetch created model`) is untouched
  // and still fails the exact-equality match.
  return withoutWrapper
    .trim()
    .replace(/\s*\([^()]*\)$/, "")
    .replace(/\.$/, "")
    .trim();
}

/**
 * True for known-benign CLIENT-side noise that cannot be a real Langfuse app
 * bug: browser-level network/transport failures, transient framework/vendor
 * poll logs, and expected browser-permission / cancellation artifacts. Returning
 * `true` drops the event in `beforeSend`.
 *
 * Design rule (safety first): only signatures that CANNOT represent a real app
 * error are listed, each keyed on an unambiguous signature (whole-message match,
 * vendor-namespaced prefix, or exception `type` + a required message guard) so a
 * real error that merely quotes a phrase still flows to Sentry. When in doubt, a
 * signature is left out. Real outages behind these client amplifications remain
 * observable server-side (request tracing / logs).
 *
 * Event shape: message-signature rules are checked against the exception value
 * AND the message-event fields (`event.message` / `event.logentry.message`),
 * because console-origin noise (NextAuth `CLIENT_FETCH_ERROR`, PostHog notices,
 * the Next.js `_error.js` artifact) is captured by `captureConsoleIntegration`
 * as a MESSAGE event with NO `event.exception` (no stacktrace is attached by
 * default). The `type`-guarded rules stay exception-only — message events carry
 * no exception `type`, and those artifacts always arrive as thrown exceptions.
 *
 * DELIBERATELY NOT dropped here (needs separate, verified handling — do not add
 * without confirming the real error is still captured elsewhere):
 *  - the generic prod error-boundary string `A client-side exception has
 *    occurred` — it aggregates real exceptions with no stack; hard-dropping it
 *    could blind us if the underlying exceptions are not captured separately.
 *  - `OAuthCallback` sign-in errors — could be a genuine auth-config break.
 *  - auth/permission (`UNAUTHORIZED`, not-a-member), query-timeout,
 *    chunk-load / stale-deploy `SyntaxError`, and Sentry perf detectors /
 *    third-party scripts — handled as UX or in Sentry project settings, not by a
 *    blind client-side drop.
 */
export function isDenylistedNoiseEvent(event: ErrorEvent): boolean {
  const exception = event.exception?.values?.[0];
  const exceptionType = exception?.type;
  const exceptionValue = exception?.value;
  const hasExceptionValue =
    typeof exceptionValue === "string" && exceptionValue.length > 0;

  // The message-signature rules run against the exception value when present,
  // otherwise the message-event text (console-origin noise has no exception).
  const messageText =
    (hasExceptionValue ? exceptionValue : undefined) ??
    event.message ??
    event.logentry?.message;

  if (typeof messageText === "string" && messageText.length > 0) {
    const core = coreMessage(messageText);

    // --- A. Transport / connectivity (whole-message match after unwrapping) ---
    if (TRANSPORT_FAILURE_MESSAGES.includes(core)) return true;

    // --- A + B + C. Unambiguous framework/vendor/transport prefixes (incl.
    // NextAuth, PostHog, non-JSON Response.json(), and the Next.js `_error.js`
    // falsy-error artifact). Anchored with startsWith, never a loose includes. ---
    if (NOISE_MESSAGE_PREFIXES.some((prefix) => core.startsWith(prefix))) {
      return true;
    }

    // --- A. Server returned an HTML error page where JSON was expected. ---
    // Requires the JSON-parse signature (`is not valid JSON`) AND an HTML body
    // marker, so it stays a "parsed an HTML error page as JSON" transport
    // artifact and does NOT overlap the chunk-load / stale-deploy `SyntaxError`
    // family (script parsing an HTML page), which is handled separately.
    if (
      messageText.includes("Unexpected token '<'") &&
      messageText.includes("<html") &&
      messageText.includes("is not valid JSON")
    ) {
      return true;
    }
  }

  // --- C. `type`-guarded rules — exception events only (message events carry
  // no exception `type`; these artifacts always arrive as thrown exceptions). ---
  if (typeof exceptionValue === "string") {
    // Expected clipboard permission denial (we already fall back). The generic
    // `NotAllowedError` type (autoplay, fullscreen, ...) REQUIRES a clipboard
    // marker alongside it.
    if (
      exceptionType === "NotAllowedError" &&
      (exceptionValue.includes("Clipboard") ||
        exceptionValue.includes("writeText"))
    ) {
      return true;
    }

    // Intentional request cancellation (nav away / superseded query).
    if (
      exceptionType === "AbortError" &&
      (exceptionValue.includes("signal is aborted") ||
        exceptionValue.includes("The operation was aborted"))
    ) {
      return true;
    }
  }

  return false;
}
