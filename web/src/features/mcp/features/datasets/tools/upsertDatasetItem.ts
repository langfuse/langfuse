import { createDatasetItemForApi } from "@/src/features/datasets/server/publicDatasetService";
import { PostDatasetItemsV1Response } from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { buildDatasetItemUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { PostDatasetItemMcpInput } from "../schema";

export const [upsertDatasetItemTool, handleUpsertDatasetItem] = defineTool({
  name: "upsertDatasetItem",
  description:
    "Upsert a dataset item (one example in a dataset) by dataset ID. Item IDs are unique per project across all datasets, so an ID used in one dataset cannot be reused in another.",
  baseSchema: PostDatasetItemMcpInput,
  inputSchema: PostDatasetItemMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_items.upsert",
      context,
      attributes: { "mcp.dataset_id": input.datasetId },
      fn: async () => {
        const result = await createDatasetItemForApi({
          input,
          projectId: context.projectId,
          auditScope: context,
        });

        const datasetItem = PostDatasetItemsV1Response.parse(result);

        return {
          ...datasetItem,
          url: buildDatasetItemUrl({
            projectId: context.projectId,
            datasetId: input.datasetId,
            datasetItemId: datasetItem.id,
          }),
        };
      },
    }),
  destructiveHint: true,
});
