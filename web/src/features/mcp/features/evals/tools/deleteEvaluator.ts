import {
  DeleteUnstableEvaluatorQuery,
  DeleteUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";
import { deletePublicEvaluator } from "@/src/features/evals/server/unstable-public-api";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [deleteEvaluatorTool, handleDeleteEvaluator] = defineTool({
  name: "deleteEvaluator",
  description:
    "Delete a project evaluator by id, including all of its versions. Fails while evaluation rules still reference the evaluator; delete those first. Langfuse-managed evaluators cannot be deleted. This cannot be undone.",
  baseSchema: DeleteUnstableEvaluatorQuery,
  inputSchema: DeleteUnstableEvaluatorQuery,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.delete",
      context,
      attributes: { "mcp.evaluator_id": input.evaluatorId },
      fn: async () => {
        await deletePublicEvaluator({
          projectId: context.projectId,
          evaluatorId: input.evaluatorId,
          auditScope: context,
        });

        return DeleteUnstableEvaluatorResponse.parse({
          message: "Evaluator successfully deleted",
        });
      },
    }),
  destructiveHint: true,
});
