/**
 * This is the client-side entrypoint for your tRPC API. It is used to create the `api` object which
 * contains the Next.js App-wrapper, as well as your type-safe React Query hooks.
 *
 * We also create a few inference helpers for input and output types.
 */

import { addBreadcrumb } from "@sentry/nextjs";
import {
  httpBatchLink,
  httpLink,
  loggerLink,
  splitLink,
  TRPCClientError,
  type TRPCClientErrorLike,
  type Operation,
  type TRPCLink,
} from "@trpc/client";
import { QueryCache } from "@tanstack/react-query";
import { createTRPCNext } from "@trpc/next";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";
import { env } from "@/src/env.mjs";
import { versionUpdateStore } from "@/src/features/version-update/versionUpdateStore";
import { type AppRouter } from "@/src/server/api/root";
import { reportError } from "@/src/utils/reportError";
import { setUpSuperjson } from "@/src/utils/superjson";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { isTrpcZodValidationError } from "@/src/utils/trpcValidationError";

export { isTrpcZodValidationError } from "@/src/utils/trpcValidationError";

setUpSuperjson();

const getBaseUrl = () => {
  const hostname =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : `http://localhost:${process.env.PORT ?? 3000}`;

  return `${hostname}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
};

// Get current pathname without the base path prefix
// for client-side navigation with a custom basePath set
export const getPathnameWithoutBasePath = () => {
  const pathname = window.location.pathname;
  const basePath = env.NEXT_PUBLIC_BASE_PATH;

  if (basePath && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || "/";
  }

  return pathname;
};

const REPORTED_FAILED_FETCH_MESSAGE = /^failed to fetch(?: \([^)]+\))?$/i;

// Cache to store hashes of recently shown errors (client-side only)
const recentErrorCache = new Set<string>();
const ERROR_DEBOUNCE_MS = 20000;

const hasResponseMeta = (error: TRPCClientError<any>): boolean =>
  Boolean((error.meta as { response?: unknown } | undefined)?.response);

const getHttpStatus = (error: unknown): number | undefined =>
  error instanceof TRPCClientError && typeof error.data?.httpStatus === "number"
    ? error.data.httpStatus
    : undefined;

const getCause = (error: unknown): unknown =>
  error instanceof Error ? error.cause : undefined;

const hasReportedFailedFetchMessage = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  return REPORTED_FAILED_FETCH_MESSAGE.test(error.message);
};

export const isNetworkConnectivityError = (error: unknown): boolean => {
  if (!(error instanceof TRPCClientError)) return false;

  // tRPC server errors and infrastructure responses have response metadata.
  if (error.data || hasResponseMeta(error)) return false;

  const cause = getCause(error);

  return (
    (cause instanceof TypeError && hasReportedFailedFetchMessage(cause)) ||
    hasReportedFailedFetchMessage(error)
  );
};

/**
 * tRPC error codes that represent EXPECTED, user-facing product states rather
 * than actionable application errors:
 *  - NOT_FOUND     — a missing/deleted/never-existed resource (opening a trace
 *                    URL that no longer resolves)
 *  - FORBIDDEN     — the signed-in user may not access this resource (a trace in
 *                    another org, a project they are not a member of)
 *  - UNAUTHORIZED  — the session expired or the user is not signed in
 *  - UNPROCESSABLE_CONTENT — a resource guardrail rejected the request with
 *                    user-facing advice. The server mints this code only for
 *                    query resource limits (`ClickHouseResourceError` → "narrow
 *                    your request…", see `withErrorHandling` in
 *                    `web/src/server/api/trpc.ts`) and oversized payloads
 *                    (`PayloadTooLargeError`, httpCode 422)
 *
 * The UI already renders each of these as an error page or toast — it is the
 * product working as designed, not a regression a human should act on. Sending
 * them to Sentry turns the error tracker into a log of ordinary navigation
 * (`Trace not found` alone is the #2 issue by volume, ~30k events / ~3.3k
 * users; the query-guardrail advice minted ~2.3k events / ~600 users in two
 * weeks) and drowns real signal.
 *
 * Suppressing capture here does NOT blind us to real authz/lookup regressions:
 * the server owns that signal — a genuine regression surfaces as a 4xx-rate
 * anomaly server-side and as user reports, whereas the client Sentry event is
 * only an amplified, lower-fidelity copy. The server itself already logs
 * NOT_FOUND / UNAUTHORIZED as non-errors and every guardrail hit as a warning
 * (`web/src/server/api/trpc.ts`), and `handleTrpcError` leaves a breadcrumb
 * for each suppressed error so its path + code stay in the trail of any real
 * event captured later in the session.
 *
 * Deliberately narrow: only these codes on an actual `TRPCClientError`, plus
 * Zod input validation (`BAD_REQUEST` whose message is a Zod 4 issue list or
 * whose `data.zodError` is populated), plus CONFLICT on
 * {@link EXPECTED_TRPC_CONFLICT_PATHS}. Empty/too-short fields and stale
 * in-app-agent approvals are the product working as designed — the toast is
 * the UX; Sentry must not log them.
 * A 5xx (`INTERNAL_SERVER_ERROR`), a non-Zod `BAD_REQUEST`, a CONFLICT
 * outside the allowlist, an unrecognized code, or any non-tRPC error is not
 * expected and keeps flowing to Sentry.
 */
export const EXPECTED_TRPC_ERROR_CODES = [
  "NOT_FOUND",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "UNPROCESSABLE_CONTENT",
] as const;

/**
 * CONFLICT is usually a uniqueness / concurrency failure we still want
 * (duplicate names, unique-constraint races). These procedures throw 409
 * only as an optimistic-concurrency / stale-UI race the product already
 * toasts — expected user-facing state, not a regression.
 *
 * `inAppAgent.decideToolApproval` is the only current member: every CONFLICT
 * it throws means the parent run is no longer AWAITING_APPROVAL (already
 * decided, expired, or cancelled). The UI already tells the user to reload.
 */
export const EXPECTED_TRPC_CONFLICT_PATHS = [
  "inAppAgent.decideToolApproval",
] as const;

const getTrpcErrorData = (
  error: unknown,
): { code?: unknown; path?: unknown } | undefined =>
  error instanceof TRPCClientError
    ? (error.data as { code?: unknown; path?: unknown } | undefined)
    : undefined;

/** The tRPC error code (`data.code`) when `error` is a TRPCClientError. */
export const getTrpcErrorCode = (error: unknown): string | undefined => {
  const code = getTrpcErrorData(error)?.code;
  return typeof code === "string" ? code : undefined;
};

/** The tRPC procedure path (`data.path`) when available — used as a Sentry tag. */
export const getTrpcErrorPath = (error: unknown): string | undefined => {
  const path = getTrpcErrorData(error)?.path;
  return typeof path === "string" ? path : undefined;
};

/**
 * Sentry fingerprint for a captured tRPC client error.
 *
 * Sentry's default grouping keys on the stack trace, and every
 * `TRPCClientError` throws from the same client-link frames — so unrelated
 * failures (different procedures, different codes, different messages)
 * collapse into one mega-issue. Grouping by code + procedure path gives each
 * distinct failure class its own issue with bounded cardinality
 * (procedures × codes) and no user data: `data.path` is the static procedure
 * name from the router definition (e.g. `traces.deleteMany`) — query input,
 * ids, and messages are never part of it.
 */
export const getTrpcErrorFingerprint = (error: unknown): string[] => [
  "trpc-client-error",
  getTrpcErrorCode(error) ?? "unknown",
  getTrpcErrorPath(error) ?? "unknown",
];

/**
 * True when `error` is a TRPCClientError whose code is an EXPECTED, user-facing
 * state that should not be captured to Sentry.
 * See {@link EXPECTED_TRPC_ERROR_CODES} and {@link EXPECTED_TRPC_CONFLICT_PATHS}.
 */
export const isExpectedTrpcClientError = (error: unknown): boolean => {
  const code = getTrpcErrorCode(error);
  if (
    code !== undefined &&
    (EXPECTED_TRPC_ERROR_CODES as readonly string[]).includes(code)
  ) {
    return true;
  }
  const path = getTrpcErrorPath(error);
  if (
    code === "CONFLICT" &&
    path !== undefined &&
    (EXPECTED_TRPC_CONFLICT_PATHS as readonly string[]).includes(path)
  ) {
    return true;
  }
  return isTrpcZodValidationError(error);
};

// HTTP statuses returned when a request's URL/headers are too large for the
// browser or an upstream proxy. The response body is usually not a tRPC
// envelope, so these are otherwise hard to diagnose.
const REQUEST_TOO_LARGE_STATUSES = [414, 431];

type SyntaxErrorWithResponseStatus = SyntaxError & { responseStatus?: number };

/**
 * `@trpc/client` (11.13.4) rejects with the bare `SyntaxError` when
 * JSON-parsing a response body fails — the link only records the response
 * meta (and so the HTTP status) for fulfilled requests. This fetch wrapper
 * re-attaches the status to the parse `SyntaxError` so error classification
 * can tell an app-owned 414/431 failure from transport garbage.
 * Exported for tests.
 */
export const fetchWithParseErrorStatus: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const originalJson = response.json.bind(response);
  response.json = async () => {
    try {
      return await originalJson();
    } catch (error) {
      if (error instanceof SyntaxError) {
        (error as SyntaxErrorWithResponseStatus).responseStatus =
          response.status;
      }
      throw error;
    }
  };
  return response;
};

/** HTTP status of a failed tRPC response: from the annotated parse error
 * (`fetchWithParseErrorStatus`) or, when a link attached it, the response meta. */
const getResponseStatus = (error: TRPCClientError<any>): number | undefined => {
  const cause = getCause(error);
  if (
    cause instanceof SyntaxError &&
    typeof (cause as SyntaxErrorWithResponseStatus).responseStatus === "number"
  ) {
    return (cause as SyntaxErrorWithResponseStatus).responseStatus;
  }
  return error.meta?.response instanceof Response
    ? error.meta.response.status
    : undefined;
};

/**
 * True when `error` is a TRPCClientError caused by the tRPC client failing to
 * JSON-parse the HTTP response body (a `SyntaxError` cause, e.g. "JSON.parse:
 * unexpected character at line 1 column 1 of the JSON data" / "Unexpected end
 * of JSON input").
 *
 * Our tRPC handler always returns JSON, so a non-JSON body means something
 * between server and client replaced or truncated it (a proxy/LB error page,
 * an interrupted connection, an intercepting proxy). That is transport state,
 * not an app bug — the server owns the real signal. A parsed tRPC error
 * envelope (`error.data`) means the server DID answer with a real error
 * shape; those keep flowing to Sentry unchanged.
 *
 * Deliberately NOT matched: a parse failure on HTTP 414/431. That is the
 * app-owned oversized-GET-URL bug class (see `sendAsPostOption`) and must
 * keep capturing. Unknown status (no annotation, no meta) stays classified
 * as transport — the live client drops the response meta on parse failures,
 * which is why `fetchWithParseErrorStatus` exists.
 */
export const isTrpcResponseParseError = (error: unknown): boolean => {
  if (!(error instanceof TRPCClientError)) return false;
  if (error.data) return false;
  if (!(getCause(error) instanceof SyntaxError)) return false;
  const status = getResponseStatus(error);
  return status === undefined || !REQUEST_TOO_LARGE_STATUSES.includes(status);
};

/**
 * Soft cap for a tRPC GET URL. The request head (URL line + cookies + headers)
 * is capped at ~16KB by Node and most proxies; cookies (NextAuth JWT, PostHog)
 * commonly consume several KB, so the serialized query URL must stay well
 * below that. Numerically similar to the page-URL filter budget
 * (`MAX_URL_FILTER_QUERY_LENGTH`) but independent of it: this bounds the full
 * tRPC GET URL (path + superjson-serialized input), not the `?filter=` param.
 * Queries whose GET URL would exceed this are sent as POST.
 */
export const MAX_TRPC_GET_URL_BYTES = 4_000;

/** Approximate GET URL size for a tRPC query, matching the live httpLink encoding. */
export const getApproxTrpcGetUrlBytes = (
  path: string,
  input: unknown,
): number => {
  const encodedInput = encodeURIComponent(
    JSON.stringify(superjson.serialize(input)),
  );
  return `${getBaseUrl()}/api/trpc/${path}?input=`.length + encodedInput.length;
};

/**
 * tRPC serializes query input into the GET URL. For reads whose input scales with
 * the number of rows (the `*.batchIO` I/O fetches) or with filter cardinality
 * (a wide `none of [userIds]` selection kept in session storage, a page of
 * `traceIds` on `traces.metrics`), that URL grows large (~6KB at 50 rows, ~12KB
 * at 100) and — together with per-user cookies (NextAuth session JWT, PostHog,
 * ...) — can exceed the request line/header budget enforced by browsers and
 * reverse proxies, failing with HTTP 414 (URI Too Long) or 431 (Request Header
 * Fields Too Large). Because cookie size varies per user, it reproduces for some
 * and not others.
 *
 * A query is sent as POST (payload in the body, URL stays small) when:
 *  - the call site opts in via the `sendAsPost` context flag: merge
 *    `sendAsPostOption` into its query options, e.g.
 *    `useQuery(input, { ...sendAsPostOption, enabled })`, or
 *  - the serialized GET URL would exceed `MAX_TRPC_GET_URL_BYTES`.
 * The server accepts query-over-POST via `allowMethodOverride` (see
 * src/pages/api/trpc/[trpc].ts); mutations stay POST-only.
 */
export const sendAsPostOption = {
  trpc: { context: { sendAsPost: true } },
} as const;

export const shouldSendQueryAsPost = (
  op: Pick<Operation, "type" | "path" | "input" | "context">,
): boolean => {
  if (op.context.sendAsPost === true) return true;
  if (op.type !== "query") return false;
  try {
    return getApproxTrpcGetUrlBytes(op.path, op.input) > MAX_TRPC_GET_URL_BYTES;
  } catch {
    // If we cannot size the input, leave routing unchanged (GET for queries).
    return false;
  }
};

const trpcApiUrl = () => `${getBaseUrl()}/api/trpc`;

const postOverrideHttpLink = () =>
  httpLink({
    url: trpcApiUrl(),
    transformer: superjson,
    methodOverride: "POST",
    fetch: fetchWithParseErrorStatus,
  });

/**
 * Creates a unique hash for an error to track it for debouncing; implementation hashes based on the tRPC path and http status
 */
const getErrorHash = (error: unknown): string => {
  if (error instanceof TRPCClientError) {
    const path = (error.data as { path?: string })?.path;
    const code = error.data?.httpStatus;

    if (path && code) return `${path}::${code}`;
  }

  if (error instanceof Error) {
    return `error::${error.message}`;
  }

  return "unknown_error::";
};

/**
 * Checks if a toast should be shown for a given error and managed debouncing logic.
 * @returns `true` if a toast should be shown, `false` if it should be suppressed.
 */
const shouldShowToast = (error: unknown): boolean => {
  if (typeof window === "undefined") return true;

  const errorHash = getErrorHash(error);

  if (recentErrorCache.has(errorHash)) {
    return false;
  }

  recentErrorCache.add(errorHash);

  // Set a timer to remove error hash from cache after the debounce period
  setTimeout(() => {
    recentErrorCache.delete(errorHash);
  }, ERROR_DEBOUNCE_MS);

  return true;
};

const handleTrpcError = (error: unknown, shouldSilenceError = false) => {
  if (error instanceof TRPCClientError) {
    const httpStatus: number =
      typeof error.data?.httpStatus === "number" ? error.data.httpStatus : 500;

    // Version mismatch UX is owned by VersionUpdateBanner (fed by
    // buildIdLink / versionUpdateStore). 400/404 here are real API errors.

    if (isExpectedTrpcClientError(error)) {
      // Expected, user-facing states (a missing/forbidden resource, an expired
      // session) are the product working as designed — don't mint a Sentry
      // issue for them. Leave a breadcrumb so the path + code stay in the trail
      // of any real event captured later this session; the server owns the real
      // authz/lookup-regression signal. See `isExpectedTrpcClientError`.
      addBreadcrumb({
        category: "trpc",
        type: "http",
        level: "info",
        message: "Suppressed expected tRPC error (not sent to Sentry)",
        data: {
          code: getTrpcErrorCode(error),
          path: getTrpcErrorPath(error),
          httpStatus,
        },
      });
    } else if (isTrpcResponseParseError(error)) {
      // The response body was not JSON (proxy error page, truncated body) —
      // transport state, not an app bug. Breadcrumb instead of capture; the
      // toast below still renders. See `isTrpcResponseParseError`.
      addBreadcrumb({
        category: "trpc",
        type: "http",
        level: "warning",
        message: "Suppressed tRPC response parse error (not sent to Sentry)",
        data: {
          message: error.message,
          status: getResponseStatus(error),
        },
      });
    } else {
      // Real tRPC errors keep flowing to Sentry, tagged and fingerprinted by
      // procedure/code so each failure class gets its own issue instead of
      // collapsing into one opaque bucket (see getTrpcErrorFingerprint).
      reportError(error, {
        area: "trpc",
        fingerprint: getTrpcErrorFingerprint(error),
        tags: {
          "trpc.code": getTrpcErrorCode(error),
          "trpc.path": getTrpcErrorPath(error),
        },
      });
    }
  } else if (shouldSilenceError) {
    // A silenced non-tRPC query error — the surface owns the error UX
    // end-to-end (meta silentAllErrors, e.g. the SSE dashboard transport:
    // stall aborts and stream failures render inline per widget, and genuine
    // server failures are logged server-side). Breadcrumb, not capture.
    addBreadcrumb({
      category: "trpc",
      type: "http",
      level: "warning",
      message: "Suppressed silenced non-tRPC query error (not sent to Sentry)",
      data: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } else {
    // For non-TRPC errors, still send to Sentry (coerced to a real Error).
    reportError(error, { area: "trpc" });
  }

  if (!shouldSilenceError && shouldShowToast(error)) {
    trpcErrorToast(error);
  }
};

/**
 * Error handler for `mutateAsync` catch blocks whose mutation KEEPS the
 * react-query default `onError`: the seam (`handleTrpcError`) already
 * classified, captured, and toasted the tRPC failure, so the catch only needs
 * to swallow the rejection — a `console.error` there would mint a second,
 * unclassified Sentry event via `captureConsoleIntegration`. Non-tRPC errors
 * (thrown by the catch's own post-success work: callbacks, router.push, ...)
 * were NOT seen by the seam and are reported with the caller's `area`.
 */
export const reportNonTrpcError = (
  error: unknown,
  area: string,
  extra?: Record<string, unknown>,
): void => {
  if (error instanceof TRPCClientError) return;
  reportError(error, { area, extra });
};

/**
 * Error handler for `mutateAsync` catch blocks whose mutation defines a local
 * `onError` (which REPLACES the react-query default): nothing classified or
 * captured the failure, so route it through the seam here — with the standard
 * error toast silenced, since the local `onError` owns the UX (form errors,
 * custom toasts). Replaces the `console.error(error)` anti-pattern, which
 * minted unclassified Sentry events via `captureConsoleIntegration`.
 * Non-tRPC errors (thrown by the catch's own post-success work) were never a
 * tRPC failure, so they are reported with the caller's `area` — mirroring
 * `reportNonTrpcError` — instead of the seam's generic `trpc` area.
 */
export const reportTrpcErrorWithoutToast = (
  error: unknown,
  area: string,
): void => {
  if (error instanceof TRPCClientError) {
    handleTrpcError(error, true);
    return;
  }
  reportError(error, { area });
};

// Reads the `x-build-id` response header (the build id serving this response)
// and feeds the version-update store that drives VersionUpdateBanner
// (see src/features/version-update). Called on EVERY response — success
// and error — so a mismatch is detected on the first response after a deploy,
// not only when a stale chunk 404s. Exported so tests can inject an observed
// build id without going through the tRPC link.
export const captureBuildId = (response: unknown) => {
  if (!(response instanceof Response)) return;
  const observed = response.headers.get("x-build-id");
  if (!observed) return;
  versionUpdateStore.reportObservedBuildId(observed);
};

// Track the build id serving tRPC responses to compare against the running one.
const buildIdLink = (): TRPCLink<AppRouter> => () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const unsubscribe = next(op).subscribe({
        next(value) {
          captureBuildId(value.context?.response);
          observer.next(value);
        },
        error(err) {
          captureBuildId(
            err.meta && err.meta.response ? err.meta.response : undefined,
          );
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });
      return unsubscribe;
    });
  };
};

// Logs request-size context to the console when a GET-routed query fails because
// its URL was too large. tRPC serializes query input into the GET URL, so an
// oversized input (a long list, a wide filter selection, ...) can trip HTTP 414
// (URI Too Long) or 431 (Request Header Fields Too Large). Surfacing the path and
// approximate URL size makes such failures diagnosable from a console screenshot
// and points at the fix (send the query as POST). Queries already routed as POST
// (`sendAsPost` or auto-oversized) and mutations are skipped.
const requestTooLargeDiagnosticsLink = (): TRPCLink<AppRouter> => () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const unsubscribe = next(op).subscribe({
        next(value) {
          observer.next(value);
        },
        error(err) {
          const sentAsGet = op.type === "query" && !shouldSendQueryAsPost(op);
          // Annotation-first (meta is dropped on JSON-parse failures — the
          // common shape of a real 414/431, whose body is empty/HTML).
          const status = getResponseStatus(err);

          if (
            sentAsGet &&
            status !== undefined &&
            REQUEST_TOO_LARGE_STATUSES.includes(status)
          ) {
            try {
              const approxUrlBytes = getApproxTrpcGetUrlBytes(
                op.path,
                op.input,
              );
              // Keep the format string constant (no interpolation) and pass the
              // dynamic values as a structured argument — they remain visible and
              // expandable in the console without risking format-string injection.
              console.error(
                "[tRPC] a query sent as GET failed because the request URL was " +
                  "too large (HTTP 414/431). Large query inputs should be sent as " +
                  "POST — add { ...sendAsPostOption } to the query's options (see " +
                  "sendAsPostOption in src/utils/api.ts).",
                { path: op.path, status, approxUrlBytes },
              );
            } catch {
              // diagnostics only — never throw from the logging path
            }
          }
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });
      return unsubscribe;
    });
  };
};

const shouldSilenceError = (
  meta: Record<string, unknown>,
  error: Error,
): boolean => {
  if (isNetworkConnectivityError(error)) {
    return true;
  }

  // For queries whose surface owns the error UX entirely (e.g. a widget's
  // inline error state) — non-HTTP errors carry no status to match against.
  if (meta?.silentAllErrors === true) {
    return true;
  }

  if (Array.isArray(meta?.silentHttpCodes)) {
    const httpStatus = getHttpStatus(error);
    return (
      httpStatus !== undefined && meta.silentHttpCodes.includes(httpStatus)
    );
  }

  return false;
};

/** APIError is returned by api.*.*.useQuery */
export type APIError = TRPCClientErrorLike<AppRouter>;

/** A set of type-safe react-query hooks for your tRPC API. */
export const api = createTRPCNext<AppRouter>({
  config() {
    return {
      /**
       * Links used to determine request flow from client to server.
       *
       * @see https://trpc.io/docs/links
       */
      links: [
        buildIdLink(),
        requestTooLargeDiagnosticsLink(),
        loggerLink({
          // Only enable in development - production logs would be captured by Sentry
          // in an unreadable format. We handle 5xx errors via reportError in
          // handleTrpcError and use DataDog for additional server-side logging.
          enabled: () => process.env.NODE_ENV === "development",
        }),
        splitLink({
          condition(op) {
            // check for context property `skipBatch`
            const skipBatch = op.context.skipBatch === true;

            // Manually skip batching, perf experiment
            const alwaysSkipBatch = true;

            return skipBatch || alwaysSkipBatch;
          },
          // when condition is true, use normal request. Route oversized queries
          // through POST so their payload does not inflate the GET URL and trip
          // HTTP 414/431. See `shouldSendQueryAsPost`.
          true: splitLink({
            condition: shouldSendQueryAsPost,
            true: postOverrideHttpLink(),
            false: httpLink({
              url: trpcApiUrl(),
              transformer: superjson,
              fetch: fetchWithParseErrorStatus,
            }),
          }),
          // when condition is false, use batching
          false: httpBatchLink({
            url: trpcApiUrl(),
            transformer: superjson,
            maxURLLength: 2083, // avoid too large batches
            fetch: fetchWithParseErrorStatus,
          }),
        }),
      ],
      queryClientConfig: {
        defaultOptions: {
          queries: {
            // react query defaults to `online`, but we want to disable it as it caused issues for some users
            networkMode: "always",
            // Don't retry on 404s: a deleted/missing resource never appears via
            // retry, so failing fast avoids piling up pointless refetches (and
            // ClickHouse load for resources backed by it). Every other 4xx keeps
            // the default retry/backoff — some (e.g. a route param that hasn't
            // hydrated yet, a proxy-level 429) are transient and self-heal.
            retry: (failureCount, error) => {
              if (getHttpStatus(error) === 404) {
                return false;
              }
              return failureCount < 3;
            },
          },
          mutations: {
            onError: (error) => handleTrpcError(error),
            // react query defaults to `online`, but we want to disable it as it caused issues for some users
            networkMode: "always",
          },
        },
        queryCache: new QueryCache({
          onError: (error, query) => {
            handleTrpcError(error, shouldSilenceError(query.meta ?? {}, error));
          },
        }),
      },
    };
  },
  /**
   * Whether tRPC should await queries when server rendering pages.
   *
   * @see https://trpc.io/docs/nextjs#ssr-boolean-default-false
   */
  ssr: false,
  transformer: superjson, // since tRPC v11 has to be here for some reason
});

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
