import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { EvaluationRuleIdInputSchema } from "../rule-schema";
import { createMcpRuleService } from "../rule-service";

export const [deleteEvaluationRuleTool, handleDeleteEvaluationRule] =
  defineTool({
    name: "deleteEvaluationRule",
    description:
      "Delete an observation evaluation rule by ID. This cannot be undone.",
    baseSchema: EvaluationRuleIdInputSchema,
    inputSchema: EvaluationRuleIdInputSchema,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.evaluation_rules.delete",
        context,
        attributes: { "mcp.evaluation_rule_id": input.evaluationRuleId },
        fn: async () => {
          await createMcpRuleService(context).delete(
            context.projectId,
            input.evaluationRuleId,
          );
          return { message: "Evaluation rule successfully deleted" };
        },
      }),
    destructiveHint: true,
  });
