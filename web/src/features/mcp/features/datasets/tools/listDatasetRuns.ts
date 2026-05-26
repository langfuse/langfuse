import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetRunsV1Response,
  transformDbDatasetRunToAPIDatasetRun,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";
import { GetDatasetRunsMcpInput } from "../schema";

export const [listDatasetRunsTool, handleListDatasetRuns] = defineTool({
  name: "listDatasetRuns",
  description:
    "List dataset runs, each experiment or evaluation execution over a dataset, by dataset name.",
  baseSchema: GetDatasetRunsMcpInput,
  inputSchema: GetDatasetRunsMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_runs.list",
      context,
      attributes: { "mcp.dataset_name": input.name },
      fn: async () => {
        const dataset = await prisma.dataset.findFirst({
          where: {
            name: input.name,
            projectId: context.projectId,
          },
          include: {
            datasetRuns: {
              where: { projectId: context.projectId },
              take: input.limit,
              skip: (input.page - 1) * input.limit,
              orderBy: { createdAt: "desc" },
            },
          },
        });

        if (!dataset) {
          throw new LangfuseNotFoundError("Dataset not found");
        }

        const totalItems = await prisma.datasetRuns.count({
          where: {
            datasetId: dataset.id,
            projectId: context.projectId,
          },
        });

        return GetDatasetRunsV1Response.parse({
          data: dataset.datasetRuns
            .map((run) => ({ ...run, datasetName: dataset.name }))
            .map(transformDbDatasetRunToAPIDatasetRun),
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
