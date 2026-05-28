import { GetDatasetItemsV1Response } from "@/src/features/public-api/types/datasets";
import { listDatasetItemsForApi } from "@/src/features/datasets/server/publicDatasetService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { GetDatasetItemsMcpInput } from "../schema";

export const [listDatasetItemsTool, handleListDatasetItems] = defineTool({
  name: "listDatasetItems",
  description:
    "List dataset items, individual examples with input and optional expected output, optionally filtered by dataset ID, source trace, source observation, or version.",
  baseSchema: GetDatasetItemsMcpInput,
  inputSchema: GetDatasetItemsMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_items.list",
      context,
      attributes: {
        "mcp.dataset_id": input.datasetId,
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const result = await listDatasetItemsForApi({
          ...input,
          projectId: context.projectId,
        });

        return GetDatasetItemsV1Response.parse(result);
      },
    }),
  readOnlyHint: true,
});
