import {
  DeleteUnstableEvaluationRuleQuery,
  DeleteUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import { deletePublicEvaluationRule } from "@/src/features/evals/server/unstable-public-api";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [deleteEvaluationRuleTool, handleDeleteEvaluationRule] =
  defineTool({
    name: "deleteEvaluationRule",
    description:
      "Delete an evaluation rule by id. This stops the rule from evaluating new items and cannot be undone.",
    baseSchema: DeleteUnstableEvaluationRuleQuery,
    inputSchema: DeleteUnstableEvaluationRuleQuery,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.evaluation_rules.delete",
        context,
        attributes: { "mcp.evaluation_rule_id": input.evaluationRuleId },
        fn: async () => {
          await deletePublicEvaluationRule({
            projectId: context.projectId,
            evaluationRuleId: input.evaluationRuleId,
            auditScope: context,
          });

          return DeleteUnstableEvaluationRuleResponse.parse({
            message: "Evaluation rule successfully deleted",
          });
        },
      }),
    destructiveHint: true,
  });
