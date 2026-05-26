import { deleteDatasetItem } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  DeleteDatasetItemV1Query,
  DeleteDatasetItemV1Response,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [deleteDatasetItemTool, handleDeleteDatasetItem] = defineTool({
  name: "deleteDatasetItem",
  description:
    "Delete a dataset item, one example in a dataset, and all its run items.",
  baseSchema: DeleteDatasetItemV1Query,
  inputSchema: DeleteDatasetItemV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_items.delete",
      context,
      attributes: { "mcp.dataset_item_id": input.datasetItemId },
      fn: async () => {
        const result = await deleteDatasetItem({
          projectId: context.projectId,
          datasetItemId: input.datasetItemId,
        });

        await auditLog({
          action: "delete",
          resourceType: "datasetItem",
          resourceId: input.datasetItemId,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          before: result.deletedItem,
        });

        return DeleteDatasetItemV1Response.parse({
          message: "Dataset item successfully deleted",
        });
      },
    }),
  destructiveHint: true,
});
