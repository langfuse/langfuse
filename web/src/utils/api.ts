/**
 * This is the client-side entrypoint for your tRPC API. It is used to create the `api` object which
 * contains the Next.js App-wrapper, as well as your type-safe React Query hooks.
 *
 * We also create a few inference helpers for input and output types.
 */

import { captureException } from "@sentry/nextjs";
import {
  createTRPCProxyClient,
  httpBatchLink,
  httpLink,
  loggerLink,
  splitLink,
  TRPCClientError,
  type Operation,
  type TRPCLink,
} from "@trpc/client";
import { QueryCache } from "@tanstack/react-query";
import { createTRPCNext } from "@trpc/next";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";
import { env } from "@/src/env.mjs";
import { showVersionUpdateToast } from "@/src/features/notifications/showVersionUpdateToast";
import { type AppRouter } from "@/src/server/api/root";
import { setUpSuperjson } from "@/src/utils/superjson";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

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

// global build id used to compare versions to show refresh toast on stale cache hit serving deprecated files
let buildId: string | null = null;

const CLIENT_STALE_CACHE_CODES = [404, 400];
const REPORTED_FAILED_FETCH_MESSAGE = /^failed to fetch(?: \([^)]+\))?$/i;

// Cache to store hashes of recently shown errors (client-side only)
const recentErrorCache = new Set<string>();
const ERROR_DEBOUNCE_MS = 20000;

const hasResponseMeta = (error: TRPCClientError<any>): boolean =>
  Boolean((error.meta as { response?: unknown } | undefined)?.response);

const getCause = (error: unknown): unknown =>
  error instanceof Error ? error.cause : undefined;

const hasReportedFailedFetchMessage = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  return REPORTED_FAILED_FETCH_MESSAGE.test(error.message);
};

const isNetworkConnectivityError = (error: unknown): boolean => {
  if (!(error instanceof TRPCClientError)) return false;

  // tRPC server errors and infrastructure responses have response metadata.
  if (error.data || hasResponseMeta(error)) return false;

  const cause = getCause(error);

  return (
    (cause instanceof TypeError && hasReportedFailedFetchMessage(cause)) ||
    hasReportedFailedFetchMessage(error)
  );
};

/* eslint-disable @repo/no-in-source-vitest */
const vitest = import.meta.vitest;

if (vitest && typeof vitest === "object") {
  const { describe, expect, it } = vitest;

  describe("isNetworkConnectivityError", () => {
    it("detects the reported failed fetch error without a response", () => {
      const error = TRPCClientError.from(new TypeError("Failed to fetch"));

      expect(isNetworkConnectivityError(error)).toBe(true);
    });

    it("detects the reported failed fetch error with a hostname suffix", () => {
      const error = TRPCClientError.from(
        new TypeError("Failed to fetch (cloud.langfuse.com)"),
      );

      expect(isNetworkConnectivityError(error)).toBe(true);
    });

    it("does not treat other network failures as connectivity errors", () => {
      const error = TRPCClientError.from(new TypeError("Load failed"));

      expect(isNetworkConnectivityError(error)).toBe(false);
    });

    it("does not treat tRPC server errors as connectivity errors", () => {
      const error = TRPCClientError.from({
        error: {
          code: -32603,
          message: "Internal server error",
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
            path: "events.all",
          },
        },
      });

      expect(isNetworkConnectivityError(error)).toBe(false);
    });

    it("does not treat response parsing errors as connectivity errors", () => {
      const error = TRPCClientError.from(
        new SyntaxError("Unexpected token <"),
        {
          meta: {
            response: new Response("<html></html>", { status: 502 }),
          },
        },
      );

      expect(isNetworkConnectivityError(error)).toBe(false);
    });

    it("does not treat non-tRPC errors as connectivity errors", () => {
      expect(isNetworkConnectivityError(new TypeError("Failed to fetch"))).toBe(
        false,
      );
    });
  });
}
/* eslint-enable @repo/no-in-source-vitest */

/**
 * tRPC serializes query input into the GET URL. For reads whose input scales with
 * the number of rows (the `*.batchIO` I/O fetches), that URL grows large (~6KB at
 * 50 rows, ~12KB at 100) and — together with per-user cookies (NextAuth session
 * JWT, PostHog, ...) — can exceed the request line/header budget enforced by
 * browsers and reverse proxies, failing with HTTP 431 (Request Header Fields Too
 * Large). Because cookie size varies per user, it reproduces for some and not
 * others.
 *
 * A query opts into being sent as POST (payload in the body, URL stays small) by
 * setting the `sendAsPost` context flag at the call site: merge `sendAsPostOption`
 * into its query options, e.g. `useQuery(input, { ...sendAsPostOption, enabled })`.
 * The server accepts query-over-POST via `allowMethodOverride` (see
 * src/pages/api/trpc/[trpc].ts); mutations stay POST-only.
 */
export const sendAsPostOption = {
  trpc: { context: { sendAsPost: true } },
} as const;

const shouldSendQueryAsPost = (op: Operation): boolean =>
  op.context.sendAsPost === true;

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

    if (CLIENT_STALE_CACHE_CODES.includes(httpStatus)) {
      if (
        !!buildId &&
        !!process.env.NEXT_PUBLIC_BUILD_ID &&
        buildId !== process.env.NEXT_PUBLIC_BUILD_ID
      ) {
        showVersionUpdateToast();
        return;
      }
    }

    captureException(error);
  } else {
    // For non-TRPC errors, still send to Sentry
    captureException(error);
  }

  if (!shouldSilenceError && shouldShowToast(error)) {
    trpcErrorToast(error);
  }
};

// onError update build id to compare versions
const buildIdLink = (): TRPCLink<AppRouter> => () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const unsubscribe = next(op).subscribe({
        next(value) {
          observer.next(value);
        },
        error(err) {
          if (
            err.meta &&
            err.meta.response &&
            err.meta.response instanceof Response
          ) {
            buildId = err.meta.response.headers.get("x-build-id");
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

// HTTP statuses returned when a request's URL/headers are too large for the
// browser or an upstream proxy. The response body is usually not a tRPC
// envelope, so these are otherwise hard to diagnose.
const REQUEST_TOO_LARGE_STATUSES = [414, 431];

// Logs request-size context to the console when a GET-routed query fails because
// its URL was too large. tRPC serializes query input into the GET URL, so an
// oversized input (a long list, a wide filter selection, ...) can trip HTTP 414
// (URI Too Long) or 431 (Request Header Fields Too Large). Surfacing the path and
// approximate URL size makes such failures diagnosable from a console screenshot
// and points at the fix (send the query as POST). `*.batchIO` and mutations are
// already POST, so the URL is not the culprit for them and they are skipped.
const requestTooLargeDiagnosticsLink = (): TRPCLink<AppRouter> => () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const unsubscribe = next(op).subscribe({
        next(value) {
          observer.next(value);
        },
        error(err) {
          const sentAsGet =
            op.type === "query" && op.context.sendAsPost !== true;
          const status =
            err.meta?.response instanceof Response
              ? err.meta.response.status
              : undefined;

          if (
            sentAsGet &&
            status !== undefined &&
            REQUEST_TOO_LARGE_STATUSES.includes(status)
          ) {
            try {
              const encodedInput = encodeURIComponent(
                JSON.stringify(superjson.serialize(op.input)),
              );
              const approxUrlBytes =
                `${getBaseUrl()}/api/trpc/${op.path}?input=`.length +
                encodedInput.length;
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

  if (Array.isArray(meta?.silentHttpCodes)) {
    return (
      error instanceof TRPCClientError &&
      typeof error.data?.httpStatus === "number" &&
      meta.silentHttpCodes.includes(error.data?.httpStatus)
    );
  }

  return false;
};

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
          // in an unreadable format. We handle 5xx errors via captureException() in
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
          // when condition is true, use normal request. Route the oversized
          // `*.batchIO` queries through POST so their per-row payload does not
          // inflate the GET URL and trip HTTP 431. See `shouldSendQueryAsPost`.
          true: splitLink({
            condition: shouldSendQueryAsPost,
            true: httpLink({
              url: `${getBaseUrl()}/api/trpc`,
              transformer: superjson,
              methodOverride: "POST",
            }),
            false: httpLink({
              url: `${getBaseUrl()}/api/trpc`,
              transformer: superjson,
            }),
          }),
          // when condition is false, use batching
          false: httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
            maxURLLength: 2083, // avoid too large batches
          }),
        }),
      ],
      queryClientConfig: {
        defaultOptions: {
          queries: {
            // react query defaults to `online`, but we want to disable it as it caused issues for some users
            networkMode: "always",
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
 * Type-safe tRPC client for usage in the browser.
 * To be used whenever you need to call the API without react hooks.
 */
export const directApi = createTRPCProxyClient<AppRouter>({
  links: [
    loggerLink({
      // Only enable in development - production logs would be captured by Sentry
      // in an unreadable format. We handle 5xx errors via captureException() in
      // handleTrpcError and use DataDog for additional server-side logging.
      enabled: () => process.env.NODE_ENV === "development",
    }),
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
      maxURLLength: 2083, // avoid too large batches
    }),
  ],
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
