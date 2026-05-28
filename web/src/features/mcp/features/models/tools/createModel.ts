import {
  PostModelsV1Body,
  PostModelsV1Response,
} from "@/src/features/public-api/types/models";
import { createModelForApi } from "@/src/features/models/server/publicApiModelService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [createModelTool, handleCreateModel] = defineTool({
  name: "createModel",
  description:
    "Create a custom model definition for cost tracking/tokenization in the current project.",
  baseSchema: PostModelsV1Body,
  inputSchema: PostModelsV1Body,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.create",
      context,
      attributes: { "mcp.model_name": input.modelName },
      fn: async () => {
        const result = await createModelForApi({
          projectId: context.projectId,
          input,
          auditScope: context,
        });

        return PostModelsV1Response.parse(result);
      },
    }),
});
