import {
  DeleteModelV1Query,
  DeleteModelV1Response,
} from "@/src/features/public-api/types/models";
import { deleteModelForApi } from "@/src/features/models/server/publicApiModelService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { getMcpAuditScope } from "../../publicApi";

export const [deleteModelTool, handleDeleteModel] = defineTool({
  name: "deleteModel",
  description:
    "Delete a custom model definition from the current project. Built-in models cannot be deleted.",
  baseSchema: DeleteModelV1Query,
  inputSchema: DeleteModelV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.delete",
      context,
      attributes: { "mcp.model_id": input.modelId },
      fn: async () => {
        const result = await deleteModelForApi({
          ...getMcpAuditScope(context),
          modelId: input.modelId,
        });

        return DeleteModelV1Response.parse(result);
      },
    }),
  destructiveHint: true,
});
