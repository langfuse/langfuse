import { PostDatasetRunItemsV1Body } from "@/src/features/public-api/types/datasets";
import { createDatasetRunItemForApi } from "@/src/features/public-api/server/dataset-run-items-api-service";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { getMcpPublicApiAuth } from "../../publicApi";

export const [createDatasetRunItemTool, handleCreateDatasetRunItem] =
  defineTool({
    name: "createDatasetRunItem",
    description:
      "Create a dataset run item, a result that links one dataset item to a trace or observation in a dataset run.",
    baseSchema: PostDatasetRunItemsV1Body,
    inputSchema: PostDatasetRunItemsV1Body,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.dataset_run_items.create",
        context,
        attributes: {
          "mcp.dataset_item_id": input.datasetItemId,
          "mcp.dataset_run_name": input.runName,
        },
        fn: async () => {
          const auth = await getMcpPublicApiAuth(context);
          return await createDatasetRunItemForApi({ body: input, auth });
        },
      }),
  });
