import { ApiError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { generateDatasetRunItemsForPublicApi } from "@/src/features/public-api/server/dataset-run-items";
import {
  GetDatasetRunV1Response,
  transformDbDatasetRunToAPIDatasetRun,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { GetDatasetRunMcpInput } from "../schema";

export const [getDatasetRunTool, handleGetDatasetRun] = defineTool({
  name: "getDatasetRun",
  description:
    "Get a dataset run, one experiment or evaluation execution over a dataset, and its run items by dataset and run name.",
  baseSchema: GetDatasetRunMcpInput,
  inputSchema: GetDatasetRunMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_runs.get",
      context,
      attributes: {
        "mcp.dataset_name": input.name,
        "mcp.dataset_run_name": input.runName,
      },
      fn: async () => {
        const datasetRuns = await prisma.datasetRuns.findMany({
          where: {
            projectId: context.projectId,
            name: input.runName,
            dataset: {
              name: input.name,
              projectId: context.projectId,
            },
          },
          include: { dataset: { select: { name: true } } },
        });

        if (datasetRuns.length > 1) {
          throw new ApiError("Found more than one dataset run with this name");
        }
        if (!datasetRuns[0]) {
          throw new LangfuseNotFoundError("Dataset run not found");
        }

        const { dataset, ...run } = datasetRuns[0];
        const datasetRunItems = await generateDatasetRunItemsForPublicApi({
          props: {
            datasetId: run.datasetId,
            runId: run.id,
            projectId: context.projectId,
          },
        });

        return GetDatasetRunV1Response.parse({
          ...transformDbDatasetRunToAPIDatasetRun({
            ...run,
            datasetName: dataset.name,
          }),
          datasetRunItems,
        });
      },
    }),
  readOnlyHint: true,
});
