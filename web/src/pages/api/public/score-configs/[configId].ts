import { prisma } from "@langfuse/shared/src/db";
import { InternalServerError, LangfuseNotFoundError } from "@langfuse/shared";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoreConfigQuery,
  GetScoreConfigResponse,
} from "@/src/features/public-api/types/score-configs";
import * as Sentry from "@sentry/node";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
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
        Sentry.captureException(parsedConfig.error);
        throw new InternalServerError("Requested score config is corrupted");
      }

      return parsedConfig.data;
    },
  }),
});
