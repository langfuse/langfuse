import { createNextApiHandler } from "@trpc/server/adapters/next";
import { createTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";
import { env } from "@/src/env.mjs";
import { logger, traceException } from "@langfuse/shared/src/server";

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
    // User errors that should not be reported to Sentry
    const userErrorCodes = [
      "NOT_FOUND",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "BAD_REQUEST",
      "PRECONDITION_FAILED",
    ];

    if (userErrorCodes.includes(error.code)) {
      logger.info(
        `tRPC route failed on ${path ?? "<no-path>"}: ${error.message}`,
        error,
      );
    } else {
      logger.error(
        `tRPC route failed on ${path ?? "<no-path>"}: ${error.message}`,
        error,
      );
      // Only report system errors to Sentry, not user errors
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
