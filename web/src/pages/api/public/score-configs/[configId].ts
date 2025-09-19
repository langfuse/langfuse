import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoreConfigQuery,
  GetScoreConfigResponse,
  PutScoreConfigBody as PatchScoreConfigBody,
  PutScoreConfigQuery as PatchScoreConfigQuery,
  PutScoreConfigResponse as PatchScoreConfigResponse,
} from "@/src/features/public-api/types/score-configs";
import {
  InternalServerError,
  InvalidRequestError,
  LangfuseNotFoundError,
  validateDbScoreConfigSafe,
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

      const parsedConfig = validateDbScoreConfigSafe(config);
      if (!parsedConfig.success) {
        traceException(parsedConfig.error);
        throw new InternalServerError("Requested score config is corrupted");
      }

      return parsedConfig.data;
    },
  }),
  PATCH: createAuthedProjectAPIRoute({
    name: "Update a Score Config",
    querySchema: PatchScoreConfigQuery,
    bodySchema: PatchScoreConfigBody,
    responseSchema: PatchScoreConfigResponse,
    fn: async ({ query, body, auth }) => {
      const existingConfig = await prisma.scoreConfig.findUnique({
        where: {
          id: query.configId,
          projectId: auth.scope.projectId,
        },
      });

      if (!existingConfig) {
        throw new LangfuseNotFoundError(
          "Score config not found within authorized project",
        );
      }

      // Merge the body with the existing config and verify schema compliance
      const result = validateDbScoreConfigSafe({ ...existingConfig, ...body });

      if (!result.success) {
        throw new InvalidRequestError(
          result.error.issues.map((issue) => issue.message).join(", "),
        );
      }

      await prisma.scoreConfig.update({
        where: {
          id: query.configId,
          projectId: auth.scope.projectId,
        },
        data: {
          ...body,
        },
      });

      return result.data;
    },
  }),
});
