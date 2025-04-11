import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoreConfigQuery,
  GetScoreConfigResponse,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { traceException } from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get a Score Config",
    querySchema: GetScoreConfigQuery,
    responseSchema: GetScoreConfigResponse,
    fn: async ({ query, auth }) => {
      const config = await prisma.scoreConfig.findUnique({
        where: {
          id: query.configId,
          projectId: auth.scope.projectId,
        },
      });

      if (!config) {
        throw new LangfuseNotFoundError(
          "Score config not found within authorized project",
        );
      }

      const parsedConfig = GetScoreConfigResponse.safeParse(config);
      if (!parsedConfig.success) {
        traceException(parsedConfig.error);
        throw new InternalServerError("Requested score config is corrupted");
      }

      return parsedConfig.data;
    },
  }),
});
