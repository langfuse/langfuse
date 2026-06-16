import { GetDatasetRunV1Response } from "@/src/features/public-api/types/datasets";
import { getDatasetRunByIdForApi } from "@/src/features/datasets/server/publicDatasetService";
import { defineTool } from "../../../core/define-tool";
import { buildDatasetRunUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { GetDatasetRunMcpInput } from "../schema";

export const [getDatasetRunTool, handleGetDatasetRun] = defineTool({
  name: "getDatasetRun",
  description:
    "Get a dataset run, one experiment or evaluation execution over a dataset, and its run items by dataset ID and run ID.",
  baseSchema: GetDatasetRunMcpInput,
  inputSchema: GetDatasetRunMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_runs.get",
      context,
      attributes: {
        "mcp.dataset_id": input.datasetId,
        "mcp.dataset_run_id": input.datasetRunId,
      },
      fn: async () => {
        const result = await getDatasetRunByIdForApi({
          projectId: context.projectId,
          datasetId: input.datasetId,
          datasetRunId: input.datasetRunId,
        });

        const datasetRun = GetDatasetRunV1Response.parse(result);

        return {
          ...datasetRun,
          url: buildDatasetRunUrl({
            projectId: context.projectId,
            datasetId: datasetRun.datasetId,
            datasetRunId: datasetRun.id,
          }),
        };
      },
    }),
  readOnlyHint: true,
});
