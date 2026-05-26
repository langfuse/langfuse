import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetsV2Query,
  GetDatasetsV2Response,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";

export const [listDatasetsTool, handleListDatasets] = defineTool({
  name: "listDatasets",
  description:
    "List datasets, named collections of input and optional expected-output examples for experiments and evaluations.",
  baseSchema: GetDatasetsV2Query,
  inputSchema: GetDatasetsV2Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.datasets.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const [datasets, totalItems] = await Promise.all([
          prisma.dataset.findMany({
            select: {
              name: true,
              description: true,
              metadata: true,
              inputSchema: true,
              expectedOutputSchema: true,
              projectId: true,
              createdAt: true,
              updatedAt: true,
              id: true,
            },
            where: { projectId: context.projectId },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: input.limit,
            skip: (input.page - 1) * input.limit,
          }),
          prisma.dataset.count({ where: { projectId: context.projectId } }),
        ]);

        return GetDatasetsV2Response.parse({
          data: datasets,
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
