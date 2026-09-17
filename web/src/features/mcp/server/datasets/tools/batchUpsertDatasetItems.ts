import { createDatasetItemForApi } from "@/src/features/datasets/server";
import { PostDatasetItemsV1Response } from "@/src/features/public-api/server";
import { buildDatasetItemUrl } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { BatchUpsertDatasetItemsMcpInput } from "../schema";

export const [batchUpsertDatasetItemsTool, handleBatchUpsertDatasetItems] =
  defineTool({
    name: "batchUpsertDatasetItems",
    description:
      "Upsert multiple dataset items in one dataset. Items are processed in order. The operation stops on the first failure and is not atomic.",
    baseSchema: BatchUpsertDatasetItemsMcpInput,
    inputSchema: BatchUpsertDatasetItemsMcpInput,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.dataset_items.batch_upsert",
        context,
        attributes: {
          "mcp.dataset_id": input.datasetId,
          "mcp.dataset_item_count": input.items.length,
        },
        fn: async () => {
          const data = [];

          for (const item of input.items) {
            const result = await createDatasetItemForApi({
              input: {
                ...item,
                datasetId: input.datasetId,
                expectedOutput:
                  item.expectedOutput === null ? "" : item.expectedOutput,
              },
              projectId: context.projectId,
              auditScope: context,
            });
            const datasetItem = PostDatasetItemsV1Response.parse(result);

            data.push({
              ...datasetItem,
              url: buildDatasetItemUrl({
                projectId: context.projectId,
                datasetId: input.datasetId,
                datasetItemId: datasetItem.id,
              }),
            });
          }

          return { data };
        },
      }),
    destructiveHint: true,
    expensiveHint: true,
  });
