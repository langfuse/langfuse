import { createNextApiHandler } from "@trpc/server/adapters/next";
import { createTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";
import { env } from "@/src/env.mjs";
import { logger, traceException } from "@langfuse/shared/src/server";
import { getTRPCErrorReporting } from "@/src/server/utils/trpc-utils";

export const config = {
  maxDuration: 240,
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};

// export API handler
export default createNextApiHandler({
  router: appRouter,
  createContext: createTRPCContext,
  // Allow queries to be sent as POST. The client only does this for the
  // `*.batchIO` I/O queries, whose per-row payload would otherwise inflate the
  // GET URL and trip HTTP 431 (queries opt in via the `sendAsPost` context flag;
  // see `sendAsPostOption` in src/utils/api.ts). This flag is handler-wide (tRPC
  // has no per-procedure option), but it only widens the accepted method for
  // queries (read-only); mutations remain POST-only, so the GET-mutation
  // protection is unchanged.
  allowMethodOverride: true,
  onError: ({ path, error }) => {
    const { logLevel, shouldTrace } = getTRPCErrorReporting(error);
    const message = `tRPC route failed on ${path ?? "<no-path>"}: ${error.message}`;

    if (logLevel === "error") {
      logger.error(message, error);
    } else if (logLevel === "warn") {
      logger.warn(message, error);
    } else {
      logger.info(message, error);
    }

    if (shouldTrace) {
      traceException(error);
    }

    return error;
  },
  responseMeta() {
    return {
      headers: {
        "x-build-id": env.NEXT_PUBLIC_BUILD_ID,
      },
    };
  },
  // as `any` workaround for Next.js 15.5+ compatibility with tRPC, probably fixed in Next.js 15.6+
  // Related: https://discord-questions.trpc.io/m/1409997624492294276
}) as any;
