import { GetDatasetsV2Response } from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { listDatasetsForApi } from "@/src/features/datasets/server/publicDatasetService";
import { GetDatasetsMcpInput } from "../schema";

export const [listDatasetsTool, handleListDatasets] = defineTool({
  name: "listDatasets",
  description:
    "List datasets, named collections of input and optional expected-output examples for experiments and evaluations. Optionally filter by dataset name to find a dataset ID.",
  baseSchema: GetDatasetsMcpInput,
  inputSchema: GetDatasetsMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.datasets.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
        "mcp.dataset_name": input.name,
      },
      fn: async () => {
        const result = await listDatasetsForApi({
          projectId: context.projectId,
          name: input.name,
          page: input.page,
          limit: input.limit,
        });

        return GetDatasetsV2Response.parse(result);
      },
    }),
  readOnlyHint: true,
});
