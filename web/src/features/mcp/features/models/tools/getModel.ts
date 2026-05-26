import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  GetModelV1Query,
  GetModelV1Response,
  prismaToApiModelDefinition,
} from "@/src/features/public-api/types/models";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { modelPricingInclude } from "../schema";

export const [getModelTool, handleGetModel] = defineTool({
  name: "getModel",
  description: "Get a model definition by ID from the current project scope.",
  baseSchema: GetModelV1Query,
  inputSchema: GetModelV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.get",
      context,
      attributes: { "mcp.model_id": input.modelId },
      fn: async () => {
        const model = await prisma.model.findFirst({
          where: {
            AND: [
              { id: input.modelId },
              {
                OR: [{ projectId: context.projectId }, { projectId: null }],
              },
            ],
          },
          include: modelPricingInclude,
        });

        if (!model) {
          throw new LangfuseNotFoundError("No model with this id found.");
        }

        return GetModelV1Response.parse(prismaToApiModelDefinition(model));
      },
    }),
  readOnlyHint: true,
});
