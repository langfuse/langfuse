import { prisma } from "@langfuse/shared/src/db";
import {
  GetSessionV1Query,
  GetSessionV1Response,
} from "@/src/features/public-api/types/sessions";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  getTracesBySessionId,
  isStorableTraceSessionId,
} from "@langfuse/shared/src/server";
import { legacyPublicApiRateLimitUpgradePaths } from "@/src/features/public-api/server/rateLimitUpgradePaths";
import { SESSIONS_DEPRECATION } from "@/src/features/public-api/server/deprecations";
import { checkApiTraceMessageAccess } from "@/src/features/traces/server/traceMessageAccess";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Session",
    action: "sessions:read",
    deprecation: SESSIONS_DEPRECATION,
    rateLimitResource: "public-api-legacy",
    querySchema: GetSessionV1Query,
    responseSchema: GetSessionV1Response,
    rateLimitUpgradePath: legacyPublicApiRateLimitUpgradePaths.sessionGet,
    // Reads from the legacy traces ClickHouse table via getTracesBySessionId,
    // which has no events_full fallback.
    rejectInEventsOnlyMode: true,
    fn: async ({ query, auth, ctx }) => {
      const { sessionId } = query;
      const session = !isStorableTraceSessionId(sessionId)
        ? null
        : await prisma.traceSession.findUnique({
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

      const canReadMessages = checkApiTraceMessageAccess({
        ctx,
        projectId: auth.scope.projectId,
        accessLevel: auth.scope.accessLevel,
      }).success;

      const traces = await getTracesBySessionId(
        auth.scope.projectId,
        [sessionId],
        undefined,
        { excludeInputOutput: !canReadMessages },
      );

      return {
        ...session,
        traces: traces.map((trace) => ({
          ...trace,
          input: canReadMessages ? trace.input : null,
          output: canReadMessages ? trace.output : null,
          externalId: null,
        })),
      };
    },
  }),
});
