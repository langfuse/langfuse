import { createNextApiHandler } from "@trpc/server/adapters/next";
import { createTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";
import { env } from "@/src/env.mjs";
import { logger, traceException } from "@langfuse/shared/src/server";

export const config = {
  maxDuration: 240,
};

// export API handler
export default createNextApiHandler({
  router: appRouter,
  createContext: createTRPCContext,
  onError: ({ path, error }) => {
    logger.error(
      `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
      error,
    );
    traceException(error);
  },
  responseMeta() {
    return {
      headers: {
        "x-build-id": env.NEXT_PUBLIC_BUILD_ID,
      },
    };
  },
});
