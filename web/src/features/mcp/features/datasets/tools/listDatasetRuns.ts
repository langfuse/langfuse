import { GetDatasetRunsV1Response } from "@/src/features/public-api/types/datasets";
import { listDatasetRunsByDatasetIdForApi } from "@/src/features/datasets/server/publicDatasetService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { GetDatasetRunsMcpInput } from "../schema";

export const [listDatasetRunsTool, handleListDatasetRuns] = defineTool({
  name: "listDatasetRuns",
  description:
    "List dataset runs, each experiment or evaluation execution over a dataset, by dataset ID.",
  baseSchema: GetDatasetRunsMcpInput,
  inputSchema: GetDatasetRunsMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_runs.list",
      context,
      attributes: { "mcp.dataset_id": input.datasetId },
      fn: async () => {
        const result = await listDatasetRunsByDatasetIdForApi({
          projectId: context.projectId,
          datasetId: input.datasetId,
          page: input.page,
          limit: input.limit,
        });

        return GetDatasetRunsV1Response.parse(result);
      },
    }),
  readOnlyHint: true,
});
