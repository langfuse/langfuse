import { prisma } from "@langfuse/shared/src/db";
import {
  GetSessionV1Query,
  GetSessionV1Response,
} from "@/src/features/public-api/types/sessions";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import { getTracesBySessionId } from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Session",
    querySchema: GetSessionV1Query,
    responseSchema: GetSessionV1Response,
    fn: async ({ query, auth }) => {
      const { sessionId } = query;

      return await measureAndReturnApi({
        input: { projectId: auth.scope.projectId, queryClickhouse: false },
        operation: "scores.countAll",
        user: null,
        pgExecution: async () => {
          throw new LangfuseNotFoundError(
            "Session not found within authorized project",
          );
        },
        clickhouseExecution: async () => {
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
            traces,
          };
        },
      });
    },
  }),
});
