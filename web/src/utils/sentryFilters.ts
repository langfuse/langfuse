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
 * The Sentry SDK synthesizes this exact prefix (global `onunhandledrejection`
 * handler) when a promise rejects with a non-`Error` value. These events carry
 * NO stack, so Sentry groups them by the stringified value — every new value
 * mints a new fingerprint.
 */
const NON_ERROR_REJECTION_PREFIX =
  "Non-Error promise rejection captured with value: ";

/**
 * Known-benign non-Error rejection values, each traced to a non-app source
 * from real events. ONLY these exact values (plus the prefixes below) are
 * dropped — an unknown value could be a real rejection from our code or a
 * bundled dependency and is KEPT, as is the object-shaped
 * `Object captured as promise rejection with keys: …` variant, which has
 * carried real failures (e.g. `code, message, stack` payloads).
 */
const BENIGN_NON_ERROR_REJECTION_VALUES: readonly string[] = [
  // Browser-extension shim (wallet/provider extensions no-op on unsupported
  // platforms and reject with this bare string). Observed with no stack and no
  // app frames (LANGFUSE-5T9).
  "Not implemented on this platform",
  // `Promise.reject()` / `reject(undefined)`: zero diagnostic content — no
  // stack, no message, no value. Nobody can act on it (LANGFUSE-5TA).
  "undefined",
];

/**
 * Prefix-matched benign rejection values whose tail varies per occurrence
 * (which is exactly what shatters grouping).
 */
const BENIGN_NON_ERROR_REJECTION_VALUE_PREFIXES: readonly string[] = [
  // Microsoft Outlook SafeLinks / email-scanner artifact: the crawler injects
  // scripts that reject with `Object Not Found Matching Id:<n>, MethodName:…`.
  // Industry-known scanner noise, never a browser session (LANGFUSE-11Z).
  "Object Not Found Matching Id:",
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
 * True for React DevTools' internal probes against React's private fiber
 * properties (`__reactContextDevtoolDebugId` and similar). These are benign:
 * DevTools reads properties React does not guarantee exist, and the resulting
 * failure is DevTools' own instrumentation, not a Langfuse app bug — it fires
 * only when the extension is attached and installs its own probes.
 *
 * Matched against ALL text fields (exception value, message-event text, and
 * the `logentry` fallback) because these can arrive as either an exception or
 * a message event depending on how DevTools triggers the failure.
 */
/**
 * The event's first NON-EMPTY text field — the exception value, else the
 * message-event text, else the `logentry` fallback. An empty-string exception
 * value is treated as absent (not nullish, so `??` alone would keep it), so a
 * "mixed" event — empty exception value but real text on `message` — still
 * matches on the message rather than being silently skipped.
 */
function eventText(event: ErrorEvent): string {
  const exceptionValue = event.exception?.values?.[0]?.value;
  return (
    (typeof exceptionValue === "string" && exceptionValue.length > 0
      ? exceptionValue
      : undefined) ??
    event.message ??
    event.logentry?.message ??
    ""
  );
}

export function isReactDevtoolsInternalEvent(event: ErrorEvent): boolean {
  return eventText(event).includes("__reactContextDevtoolDebugId");
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
 *  - auth/permission (`UNAUTHORIZED`, not-a-member), query-timeout, and Sentry
 *    perf detectors / third-party scripts — handled as UX or in Sentry project
 *    settings, not by a blind client-side drop.
 *  - the chunk-load / stale-deploy `SyntaxError` family — GROUPED (not dropped)
 *    via {@link isStaleChunkParseErrorEvent} so a genuinely broken deploy still
 *    surfaces as a spike on one issue.
 */
export function isDenylistedNoiseEvent(event: ErrorEvent): boolean {
  const exception = event.exception?.values?.[0];
  const exceptionType = exception?.type;
  const exceptionValue = exception?.value;

  // Message-signature rules run against the first non-empty text field
  // (exception value → message → logentry); `eventText` treats an empty
  // exception value as absent so mixed events still match on the message.
  const messageText = eventText(event);

  if (messageText.length > 0) {
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

    // Known-benign non-Error promise rejections. The `UnhandledRejection`
    // exception type is SDK-synthesized (a real `Error` rejection keeps its own
    // type, e.g. `TypeError`), and the value denylist is exact/prefix-anchored:
    // an unknown rejection value still flows to Sentry. See
    // BENIGN_NON_ERROR_REJECTION_VALUES for per-value provenance.
    if (
      exceptionType === "UnhandledRejection" &&
      exceptionValue.startsWith(NON_ERROR_REJECTION_PREFIX)
    ) {
      const rejectionValue = exceptionValue.slice(
        NON_ERROR_REJECTION_PREFIX.length,
      );
      if (
        BENIGN_NON_ERROR_REJECTION_VALUES.includes(rejectionValue) ||
        BENIGN_NON_ERROR_REJECTION_VALUE_PREFIXES.some((prefix) =>
          rejectionValue.startsWith(prefix),
        )
      ) {
        return true;
      }
    }

    // Environmental storage-access denial: browsers throw a `SecurityError`
    // DOMException on the `window.localStorage` property GETTER itself when
    // storage is blocked (third-party iframe, privacy mode). The message is
    // browser-generated — app logic cannot produce it — and every storage read
    // in the app already falls back to its initial value (see useLocalStorage /
    // useSessionStorage). Stacks point at per-deploy hashed chunks, so each
    // occurrence minted a new fingerprint (LANGFUSE-5TC/5TD/5TE/5TF). Other
    // `SecurityError`s (e.g. cross-origin frame access) are KEPT.
    if (
      exceptionType === "SecurityError" &&
      /^Failed to read the '(localStorage|sessionStorage)' property from 'Window':/.test(
        exceptionValue,
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Fingerprint used to collapse all stale-chunk parse errors into ONE Sentry
 * issue (see {@link isStaleChunkParseErrorEvent}).
 */
export const STALE_CHUNK_PARSE_FINGERPRINT = "stale-chunk-parse-error";

/**
 * True for a browser-level parse failure of a Next.js chunk: the global
 * `onerror` handler caught a `SyntaxError` whose entire stack is ONE anonymous
 * frame at a `/_next/static/chunks/…` script — the shape a browser produces
 * when a script's CONTENT fails to parse (truncated download, or a stale
 * client fetching a chunk that no longer exists and receiving garbage after a
 * deploy). Chunk filenames are content-hashed, so Sentry minted a new
 * fingerprint per chunk per deploy (LANGFUSE-5WH/5WG/5WD/5S7 and the 1-event
 * long tail). The reload banner (#15279) is the mitigation for the cause.
 *
 * These events are GROUPED under {@link STALE_CHUNK_PARSE_FINGERPRINT} in
 * `beforeSend`, NOT dropped: if a deploy ever ships a genuinely unparseable
 * chunk to everyone, the single grouped issue spikes and stays visible.
 *
 * Cannot catch a user-authored or app-code `SyntaxError`:
 *  - the evals code editor reports user-code syntax errors via
 *    `console.error` (mechanism `auto.core.capture_console`) with app frames
 *    (`web/src/features/evals/…`) — different mechanism, multi-frame stack;
 *  - a runtime `SyntaxError` thrown by app code (e.g. `JSON.parse`) carries
 *    its throwing function and callers — more than one frame / a named
 *    function.
 */
export function isStaleChunkParseErrorEvent(event: ErrorEvent): boolean {
  const exception = event.exception?.values?.[0];
  if (exception?.type !== "SyntaxError") return false;
  if (exception.mechanism?.type !== "auto.browser.global_handlers.onerror") {
    return false;
  }

  const frames = exception.stacktrace?.frames;
  if (!frames || frames.length !== 1) return false;

  const frame = frames[0];
  // Parse errors carry no function — a named function means runtime code threw.
  if (frame?.function) return false;

  return (
    typeof frame?.filename === "string" &&
    frame.filename.includes("/_next/static/chunks/")
  );
}

/**
 * PostHog's lazily-loaded session-replay recorder script (served as
 * `/static/posthog-recorder.js?v=<posthog-js version>`).
 */
const POSTHOG_RECORDER_SCRIPT_SUFFIX = "/static/posthog-recorder.js";

/**
 * Frames that carry no attribution: browser-native/eval frames, and the Sentry
 * SDK's own wrapper frames (its `wrap()` helper sits at the outer edge of
 * every instrumented listener stack).
 */
function isOpaqueOrSdkFrame(filename: string): boolean {
  return (
    filename === "<anonymous>" ||
    filename === "[native code]" ||
    (filename.includes("node_modules") && filename.includes("@sentry"))
  );
}

/**
 * True for errors thrown wholly INSIDE PostHog's session-replay recorder:
 * every attributable stack frame lives in the recorder script (plus at most
 * browser-native and Sentry-SDK wrapper frames). rrweb's DOM serialization
 * throws on exotic page content (observed: `SyntaxError: Invalid or unexpected
 * token` from `processMutations` / `onRRwebEmit`, LANGFUSE-5VY/5VX), and each
 * throw site mints a new fingerprint per recorder version.
 *
 * Safe to drop: an error thrown by OUR code always carries at least one app
 * chunk frame (the throwing frame), which fails this check. Errors with no
 * app frame are the vendor recorder failing internally — not a Langfuse app
 * bug, and not actionable in Sentry (session replay is best-effort telemetry;
 * a broken recorder shows up as missing recordings in PostHog, not here).
 * Same posture as the browser-extension `denyUrls` entries, expressed as a
 * testable predicate because the crash frame is often `<anonymous>`, which
 * `denyUrls` skips inconsistently.
 */
export function isPosthogRecorderInternalEvent(event: ErrorEvent): boolean {
  const frames = event.exception?.values?.[0]?.stacktrace?.frames;
  if (!frames || frames.length === 0) return false;

  let sawRecorderFrame = false;
  for (const frame of frames) {
    const filename = frame?.filename;
    // A frame with no filename has no attribution — treat like <anonymous>.
    if (typeof filename !== "string" || filename.length === 0) continue;
    if (filename.endsWith(POSTHOG_RECORDER_SCRIPT_SUFFIX)) {
      sawRecorderFrame = true;
      continue;
    }
    if (isOpaqueOrSdkFrame(filename)) continue;
    // Any other frame (app chunk, other vendor) → not recorder-internal.
    return false;
  }
  return sawRecorderFrame;
}
