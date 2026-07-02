import { prisma } from "@langfuse/shared/src/db";
import {
  GetSessionV1Query,
  GetSessionV1Response,
} from "@/src/features/public-api/types/sessions";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { getTracesBySessionId } from "@langfuse/shared/src/server";
import { legacyPublicApiRateLimitUpgradePaths } from "@/src/features/public-api/server/rateLimitUpgradePaths";

// Trace timestamps are client-supplied and may predate the session row's
// ingestion-time createdAt (e.g. backfills, buffered OTEL exports). Two days
// of slack covers realistic backdating while still letting ClickHouse prune
// partitions by timestamp. Callers with older traces can widen the window
// via the fromTimestamp query parameter.
const SESSION_TRACE_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Session",
    rateLimitResource: "public-api-legacy",
    querySchema: GetSessionV1Query,
    responseSchema: GetSessionV1Response,
    rateLimitUpgradePath: legacyPublicApiRateLimitUpgradePaths.sessionGet,
    // Reads from the legacy traces ClickHouse table via getTracesBySessionId,
    // which has no events_full fallback.
    rejectInEventsOnlyMode: true,
    fn: async ({ query, auth }) => {
      const { sessionId, fromTimestamp } = query;
      const session = await prisma.traceSession.findUnique({
        where: {
          id_projectId: {
            id: sessionId,
            projectId: auth.scope.projectId,
          },
        },
        select: {
          id: true,
          createdAt: true,
          projectId: true,
          environment: true,
        },
      });

      if (!session) {
        throw new LangfuseNotFoundError(
          "Session not found within authorized project",
        );
      }

      const traces = await getTracesBySessionId(
        auth.scope.projectId,
        [sessionId],
        fromTimestamp
          ? new Date(fromTimestamp)
          : new Date(session.createdAt.getTime() - SESSION_TRACE_LOOKBACK_MS),
      );

      return {
        ...session,
        traces: traces.map((trace) => ({
          ...trace,
          externalId: null,
        })),
      };
    },
  }),
});
