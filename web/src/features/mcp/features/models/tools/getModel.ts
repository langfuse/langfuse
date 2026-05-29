import {
  GetModelV1Query,
  GetModelV1Response,
} from "@/src/features/public-api/types/models";
import { getModelForApi } from "@/src/features/models/server/publicApiModelService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [getModelTool, handleGetModel] = defineTool({
  name: "getModel",
  description: "Get a model definition by ID from the current project scope.",
  baseSchema: GetModelV1Query,
  inputSchema: GetModelV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.get",
      context,
      attributes: { "mcp.model_id": input.modelId },
      fn: async () => {
        const result = await getModelForApi({
          projectId: context.projectId,
          modelId: input.modelId,
        });

        return GetModelV1Response.parse(result);
      },
    }),
  readOnlyHint: true,
});
