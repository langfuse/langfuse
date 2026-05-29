import { createDatasetItemForApi } from "@/src/features/datasets/server/publicDatasetService";
import {
  PostDatasetItemsV1Body,
  PostDatasetItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [upsertDatasetItemTool, handleUpsertDatasetItem] = defineTool({
  name: "upsertDatasetItem",
  description:
    "Upsert a dataset item, one example in a dataset with input and optional expected output.",
  baseSchema: PostDatasetItemsV1Body,
  inputSchema: PostDatasetItemsV1Body,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_items.upsert",
      context,
      attributes: { "mcp.dataset_name": input.datasetName },
      fn: async () => {
        const result = await createDatasetItemForApi({
          input,
          auditScope: context,
        });

        return PostDatasetItemsV1Response.parse(result);
      },
    }),
  destructiveHint: true,
});
