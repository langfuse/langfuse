import { deleteDatasetRunByIdForApi } from "@/src/features/datasets/server/publicDatasetService";
import { DeleteDatasetRunV1Response } from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { DeleteDatasetRunMcpInput } from "../schema";

export const [deleteDatasetRunTool, handleDeleteDatasetRun] = defineTool({
  name: "deleteDatasetRun",
  description:
    "Delete a dataset run by dataset ID and run ID, and enqueue deletion of its run items.",
  baseSchema: DeleteDatasetRunMcpInput,
  inputSchema: DeleteDatasetRunMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_runs.delete",
      context,
      attributes: {
        "mcp.dataset_id": input.datasetId,
        "mcp.dataset_run_id": input.datasetRunId,
      },
      fn: async () => {
        const result = await deleteDatasetRunByIdForApi({
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          datasetId: input.datasetId,
          datasetRunId: input.datasetRunId,
        });

        return DeleteDatasetRunV1Response.parse(result);
      },
    }),
  destructiveHint: true,
});
