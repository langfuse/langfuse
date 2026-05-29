import { z } from "zod";
import {
  GetDatasetRunsV1Query,
  GetDatasetRunsV1Response,
} from "@/src/features/public-api/types/datasets";
import { listDatasetRunsForApi } from "@/src/features/datasets/server/publicDatasetService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const GetDatasetRunsMcpInput = GetDatasetRunsV1Query.extend({
  name: z.string(),
});

export const [listDatasetRunsTool, handleListDatasetRuns] = defineTool({
  name: "listDatasetRuns",
  description:
    "List dataset runs, each experiment or evaluation execution over a dataset, by dataset name.",
  baseSchema: GetDatasetRunsMcpInput,
  inputSchema: GetDatasetRunsMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_runs.list",
      context,
      attributes: { "mcp.dataset_name": input.name },
      fn: async () => {
        const result = await listDatasetRunsForApi({
          projectId: context.projectId,
          name: input.name,
          page: input.page,
          limit: input.limit,
        });

        return GetDatasetRunsV1Response.parse(result);
      },
    }),
  readOnlyHint: true,
});
