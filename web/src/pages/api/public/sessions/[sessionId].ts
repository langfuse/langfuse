import { prisma } from "@langfuse/shared/src/db";
import {
  GetSessionV1Query,
  GetSessionV1Response,
} from "@/src/features/public-api/types/sessions";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { getTracesBySessionId } from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Session",
    querySchema: GetSessionV1Query,
    responseSchema: GetSessionV1Response,
    fn: async ({ query, auth }) => {
      const { sessionId } = query;
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

      const traces = await getTracesBySessionId(auth.scope.projectId, [
        sessionId,
      ]);

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
