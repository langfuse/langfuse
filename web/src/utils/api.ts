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

// Cache to store hashes of recently shown errors (client-side only)
const recentErrorCache = new Set<string>();
const ERROR_DEBOUNCE_MS = 20000;

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

const handleTrpcError = (
  error: unknown,
  shouldSilenceError: boolean = false,
) => {
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

const shouldSilenceError = (
  meta: Record<string, unknown>,
  error: Error,
): boolean => {
  if (Array.isArray(meta?.silentHttpCodes)) {
    return (
      error instanceof TRPCClientError &&
      meta.silentHttpCodes.includes(error.data.httpStatus)
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
          // when condition is true, use normal request
          true: httpLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
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
