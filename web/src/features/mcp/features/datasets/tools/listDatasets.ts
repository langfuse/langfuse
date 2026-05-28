import {
  GetDatasetsV2Query,
  GetDatasetsV2Response,
} from "@/src/features/public-api/types/datasets";
import { listDatasetsForApi } from "@/src/features/datasets/server/publicDatasetService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [listDatasetsTool, handleListDatasets] = defineTool({
  name: "listDatasets",
  description:
    "List datasets, named collections of input and optional expected-output examples for experiments and evaluations.",
  baseSchema: GetDatasetsV2Query,
  inputSchema: GetDatasetsV2Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.datasets.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const result = await listDatasetsForApi({
          projectId: context.projectId,
          page: input.page,
          limit: input.limit,
        });

        return GetDatasetsV2Response.parse(result);
      },
    }),
  readOnlyHint: true,
});
