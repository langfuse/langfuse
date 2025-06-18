import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  DeleteModelV1Query,
  DeleteModelV1Response,
  GetModelV1Query,
  GetModelV1Response,
  prismaToApiModelDefinition,
} from "@/src/features/public-api/types/models";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get model definitions",
    querySchema: GetModelV1Query,
    responseSchema: GetModelV1Response,
    fn: async ({ query, auth }) => {
      const model = await prisma.model.findFirst({
        where: {
          AND: [
            {
              id: query.modelId,
            },
            {
              OR: [
                {
                  projectId: auth.scope.projectId,
                },
                {
                  projectId: null,
                },
              ],
            },
          ],
        },
        include: {
          Price: {
            select: { usageType: true, price: true },
          },
        },
      });
      if (!model) {
        throw new LangfuseNotFoundError("No model with this id found.");
      }
      return prismaToApiModelDefinition(model);
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete model",
    querySchema: DeleteModelV1Query,
    responseSchema: DeleteModelV1Response,
    fn: async ({ query, auth }) => {
      const model = await prisma.model.findFirst({
        where: {
          id: query.modelId,
          projectId: auth.scope.projectId,
        },
      });
      if (!model) {
        throw new LangfuseNotFoundError(
          "No model with this id found. Note: You cannot delete built-in models, override them with a model with the same name.",
        );
      }
      await prisma.model.delete({
        where: {
          id: query.modelId,
          projectId: auth.scope.projectId,
        },
      });
      await auditLog({
        action: "delete",
        resourceType: "model",
        resourceId: query.modelId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before: model,
      });

      return {
        message: "Model successfully deleted" as const,
      };
    },
  }),
});
