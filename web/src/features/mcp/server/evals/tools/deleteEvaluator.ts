import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createMcpEvaluatorService } from "../evaluator-service";
import { EVALUATOR_ID_DESCRIPTION } from "./evaluatorInput";

const DeleteEvaluatorInput = z.object({
  evaluatorId: z.string().describe(EVALUATOR_ID_DESCRIPTION),
});

export const [deleteEvaluatorTool, handleDeleteEvaluator] = defineTool({
  name: "deleteEvaluator",
  description:
    "Permanently delete a project evaluator and all its versions. It is removed from every evaluation rule using it (getEvaluator shows how many); rules left without an evaluator are deactivated. Existing scores are kept. Langfuse-managed evaluators cannot be deleted.",
  action: "evaluator:CUD",
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
  annotations: { destructiveHint: true },
});
