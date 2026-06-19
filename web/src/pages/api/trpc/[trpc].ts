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
