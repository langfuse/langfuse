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
    if (error.code === "NOT_FOUND" || error.code === "UNAUTHORIZED") {
      logger.info(
        `tRPC route failed on ${path ?? "<no-path>"}: ${error.message}`,
        error,
      );
    } else {
      logger.error(
        `tRPC route failed on ${path ?? "<no-path>"}: ${error.message}`,
        error,
      );
    }
    traceException(error);
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
