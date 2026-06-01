import { listDatasetRunItemsByRunIdForApi } from "@/src/features/public-api/server/dataset-run-items-api-service";
import { GetDatasetRunItemsV1Response } from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";
import { GetDatasetRunItemsMcpInput } from "../schema";

export const [listDatasetRunItemsTool, handleListDatasetRunItems] = defineTool({
  name: "listDatasetRunItems",
  description:
    "List dataset run items, each linking one dataset item to a trace or observation within a dataset run, by dataset ID and run ID.",
  baseSchema: GetDatasetRunItemsMcpInput,
  inputSchema: GetDatasetRunItemsMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_run_items.list",
      context,
      attributes: {
        "mcp.dataset_id": input.datasetId,
        "mcp.dataset_run_id": input.datasetRunId,
      },
      fn: async () => {
        const result = await listDatasetRunItemsByRunIdForApi({
          datasetId: input.datasetId,
          datasetRunId: input.datasetRunId,
          projectId: context.projectId,
          limit: input.limit,
          page: input.page,
        });

        return GetDatasetRunItemsV1Response.parse({
          data: result.data,
          meta: paginationMeta(result.meta),
        });
      },
    }),
  readOnlyHint: true,
});
