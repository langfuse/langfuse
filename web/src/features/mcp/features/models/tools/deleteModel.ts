import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { clearModelCacheForProject } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  DeleteModelV1Query,
  DeleteModelV1Response,
} from "@/src/features/public-api/types/models";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [deleteModelTool, handleDeleteModel] = defineTool({
  name: "deleteModel",
  description:
    "Delete a custom model definition from the current project. Built-in models cannot be deleted.",
  baseSchema: DeleteModelV1Query,
  inputSchema: DeleteModelV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.delete",
      context,
      attributes: { "mcp.model_id": input.modelId },
      fn: async () => {
        const model = await prisma.model.findFirst({
          where: {
            id: input.modelId,
            projectId: context.projectId,
          },
        });

        if (!model) {
          throw new LangfuseNotFoundError(
            "No model with this id found. Note: You cannot delete built-in models, override them with a model with the same name.",
          );
        }

        await prisma.model.delete({
          where: {
            id: input.modelId,
            projectId: context.projectId,
          },
        });

        await auditLog({
          action: "delete",
          resourceType: "model",
          resourceId: input.modelId,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          before: model,
        });

        await clearModelCacheForProject(context.projectId);

        return DeleteModelV1Response.parse({
          message: "Model successfully deleted",
        });
      },
    }),
  destructiveHint: true,
});
