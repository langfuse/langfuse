import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createMcpEvaluatorService } from "../evaluator-service";

const DeleteEvaluatorInput = z.object({ evaluatorId: z.string() });

export const [deleteEvaluatorTool, handleDeleteEvaluator] = defineTool({
  name: "deleteEvaluator",
  description: "Delete an evaluator. This cannot be undone.",
  baseSchema: DeleteEvaluatorInput,
  inputSchema: DeleteEvaluatorInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.delete",
      context,
      attributes: { "mcp.evaluator_id": input.evaluatorId },
      fn: async () => {
        const service = createMcpEvaluatorService(context);
        await service.delete(context.projectId, input.evaluatorId);
        return { message: "Evaluator successfully deleted" };
      },
    }),
  destructiveHint: true,
});
