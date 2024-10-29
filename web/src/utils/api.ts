/**
 * This is the client-side entrypoint for your tRPC API. It is used to create the `api` object which
 * contains the Next.js App-wrapper, as well as your type-safe React Query hooks.
 *
 * We also create a few inference helpers for input and output types.
 */
import {
  createTRPCProxyClient,
  httpBatchLink,
  httpLink,
  loggerLink,
  splitLink,
  TRPCClientError,
  type TRPCLink,
} from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { createTRPCNext } from "@trpc/next";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";

import { type AppRouter } from "@/src/server/api/root";
import { setUpSuperjson } from "@/src/utils/superjson";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { showVersionUpdateToast } from "@/src/features/notifications/showVersionUpdateToast";
import { captureException } from "@sentry/nextjs";
import { env } from "@/src/env.mjs";

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

// global build id used to compare versions to show refresh toast on stale cache hit serving deprecated files
let buildId: string | null = null;

const CLIENT_STALE_CACHE_CODES = [404, 400];

const handleTrpcError = (error: unknown) => {
  captureException(error);
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
  }

  trpcErrorToast(error);
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

/** A set of type-safe react-query hooks for your tRPC API. */
export const api = createTRPCNext<AppRouter>({
  config() {
    return {
      /**
       * Transformer used for data de-serialization from the server.
       *
       * @see https://trpc.io/docs/data-transformers
       */
      transformer: superjson,

      /**
       * Links used to determine request flow from client to server.
       *
       * @see https://trpc.io/docs/links
       */
      links: [
        buildIdLink(),
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === "development" ||
            (opts.direction === "down" && opts.result instanceof Error),
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
          }),
          // when condition is false, use batching
          false: httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
            maxURLLength: 2083, // avoid too large batches
          }),
        }),
      ],
      queryClientConfig: {
        defaultOptions: {
          queries: {
            onError: (error) => handleTrpcError(error),
            // react query defaults to `online`, but we want to disable it as it caused issues for some users
            networkMode: "always",
          },
          mutations: {
            onError: (error) => handleTrpcError(error),
            // react query defaults to `online`, but we want to disable it as it caused issues for some users
            networkMode: "always",
          },
        },
      },
    };
  },
  /**
   * Whether tRPC should await queries when server rendering pages.
   *
   * @see https://trpc.io/docs/nextjs#ssr-boolean-default-false
   */
  ssr: false,
});

/**
 * Type-safe tRPC client for usage in the browser.
 * To be used whenever you need to call the API without react hooks.
 */
export const directApi = createTRPCProxyClient<AppRouter>({
  transformer: superjson,
  links: [
    loggerLink({
      enabled: (opts) =>
        process.env.NODE_ENV === "development" ||
        (opts.direction === "down" && opts.result instanceof Error),
    }),
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
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
