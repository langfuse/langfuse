import { prisma } from "@langfuse/shared/src/db";
import {
  GetModelsV1Query,
  GetModelsV1Response,
  prismaToApiModelDefinition,
} from "@/src/features/public-api/types/models";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";
import { modelPricingInclude } from "../schema";

export const [listModelsTool, handleListModels] = defineTool({
  name: "listModels",
  description:
    "List custom and Langfuse-managed model definitions visible to the current project.",
  baseSchema: GetModelsV1Query,
  inputSchema: GetModelsV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const where = {
          OR: [{ projectId: context.projectId }, { projectId: null }],
        };

        const [models, totalItems] = await Promise.all([
          prisma.model.findMany({
            where,
            orderBy: [
              { modelName: "asc" },
              { unit: "asc" },
              {
                startDate: {
                  sort: "desc",
                  nulls: "last",
                },
              },
            ],
            include: modelPricingInclude,
            take: input.limit,
            skip: (input.page - 1) * input.limit,
          }),
          prisma.model.count({ where }),
        ]);

        return GetModelsV1Response.parse({
          data: models.map(prismaToApiModelDefinition),
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems,
          }),
        });
      },
    }),
  readOnlyHint: true,
});
