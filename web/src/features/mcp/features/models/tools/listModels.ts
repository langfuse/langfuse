import {
  GetModelsV1Query,
  GetModelsV1Response,
} from "@/src/features/public-api/types/models";
import { listModelsForApi } from "@/src/features/models/server/publicApiModelService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [listModelsTool, handleListModels] = defineTool({
  name: "listModels",
  description:
    "List custom and Langfuse-managed model definitions visible to the current project.",
  baseSchema: GetModelsV1Query,
  inputSchema: GetModelsV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const result = await listModelsForApi({
          projectId: context.projectId,
          page: input.page,
          limit: input.limit,
        });

        return GetModelsV1Response.parse(result);
      },
    }),
  readOnlyHint: true,
});
