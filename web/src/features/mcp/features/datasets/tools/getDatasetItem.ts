import {
  GetDatasetItemV1Query,
  GetDatasetItemV1Response,
} from "@/src/features/public-api/types/datasets";
import { getDatasetItemForApi } from "@/src/features/datasets/server/publicDatasetService";
import { defineTool } from "../../../core/define-tool";
import { buildDatasetItemUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [getDatasetItemTool, handleGetDatasetItem] = defineTool({
  name: "getDatasetItem",
  description:
    "Get a dataset item, one example in a dataset with input and optional expected output, by ID.",
  baseSchema: GetDatasetItemV1Query,
  inputSchema: GetDatasetItemV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_items.get",
      context,
      attributes: { "mcp.dataset_item_id": input.datasetItemId },
      fn: async () => {
        const result = await getDatasetItemForApi({
          datasetItemId: input.datasetItemId,
          projectId: context.projectId,
        });

        const datasetItem = GetDatasetItemV1Response.parse(result);

        return {
          ...datasetItem,
          url: buildDatasetItemUrl({
            projectId: context.projectId,
            datasetId: datasetItem.datasetId,
            datasetItemId: datasetItem.id,
          }),
        };
      },
    }),
  readOnlyHint: true,
});
