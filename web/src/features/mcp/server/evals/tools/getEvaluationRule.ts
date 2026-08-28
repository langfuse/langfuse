import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { EvaluationRuleIdInputSchema } from "../rule-schema";
import { createMcpRuleService, toMcpEvaluationRule } from "../rule-service";

export const [getEvaluationRuleTool, handleGetEvaluationRule] = defineTool({
  name: "getEvaluationRule",
  description:
    "Fetch an observation evaluation rule by ID, including all evaluator assignments, filters, sampling, and status.",
  baseSchema: EvaluationRuleIdInputSchema,
  inputSchema: EvaluationRuleIdInputSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluation_rules.get",
      context,
      attributes: { "mcp.evaluation_rule_id": input.evaluationRuleId },
      fn: async () =>
        toMcpEvaluationRule(
          await createMcpRuleService(context).get(
            context.projectId,
            input.evaluationRuleId,
          ),
        ),
    }),
  readOnlyHint: true,
});
