import { createNextApiHandler } from "@trpc/server/adapters/next";
import { getActiveTraceId, getCurrentSpan } from "@langfuse/shared/src/server";
import { createTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";
import { buildTrpcCorrelationHeaders } from "@/src/server/utils/trpcCorrelationHeaders";
import { env } from "@/src/env.mjs";
import { reportTRPCError } from "@/src/server/utils/trpc-utils";

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
  // Allow queries to be sent as POST. The client does this for `*.batchIO`
  // I/O queries (opt-in via `sendAsPostOption`) and for any query whose
  // serialized GET URL would exceed `MAX_TRPC_GET_URL_BYTES` (wide filters,
  // per-row id lists). This flag is handler-wide (tRPC has no per-procedure
  // option), but it only widens the accepted method for queries (read-only);
  // mutations remain POST-only, so the GET-mutation protection is unchanged.
  allowMethodOverride: true,
  onError: reportTRPCError,
  // Once per HTTP response, so a batch and a single call share one id pair.
  // Gateway 502/504 pages never reach this handler and simply omit the headers.
  responseMeta({ ctx }) {
    return {
      headers: buildTrpcCorrelationHeaders({
        buildId: env.NEXT_PUBLIC_BUILD_ID,
        incomingRequestId: ctx?.headers?.["x-request-id"],
        traceId: getActiveTraceId(),
        span: getCurrentSpan(),
      }),
    };
  },
  // as `any` workaround for Next.js 15.5+ compatibility with tRPC, probably fixed in Next.js 15.6+
  // Related: https://discord-questions.trpc.io/m/1409997624492294276
}) as any;
