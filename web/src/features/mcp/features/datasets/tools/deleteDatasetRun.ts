import { deleteDatasetRunForApi } from "@/src/features/datasets/server/publicDatasetService";
import { DeleteDatasetRunV1Response } from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { DeleteDatasetRunMcpInput } from "../schema";

export const [deleteDatasetRunTool, handleDeleteDatasetRun] = defineTool({
  name: "deleteDatasetRun",
  description:
    "Delete a dataset run, one experiment or evaluation execution over a dataset, and enqueue deletion of its run items.",
  baseSchema: DeleteDatasetRunMcpInput,
  inputSchema: DeleteDatasetRunMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_runs.delete",
      context,
      attributes: {
        "mcp.dataset_name": input.name,
        "mcp.dataset_run_name": input.runName,
      },
      fn: async () => {
        const result = await deleteDatasetRunForApi({
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          name: input.name,
          runName: input.runName,
        });

        return DeleteDatasetRunV1Response.parse(result);
      },
    }),
  destructiveHint: true,
});
