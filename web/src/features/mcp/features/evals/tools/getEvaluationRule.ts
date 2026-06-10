import {
  GetUnstableEvaluationRuleQuery,
  GetUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import { getPublicEvaluationRule } from "@/src/features/evals/server/unstable-public-api";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [getEvaluationRuleTool, handleGetEvaluationRule] = defineTool({
  name: "getEvaluationRule",
  description:
    "Fetch a single evaluation rule by id, including its evaluator reference, target, filter, variable mapping, sampling, and status.",
  baseSchema: GetUnstableEvaluationRuleQuery,
  inputSchema: GetUnstableEvaluationRuleQuery,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluation_rules.get",
      context,
      attributes: { "mcp.evaluation_rule_id": input.evaluationRuleId },
      fn: async () => {
        const result = await getPublicEvaluationRule({
          projectId: context.projectId,
          evaluationRuleId: input.evaluationRuleId,
        });

        return GetUnstableEvaluationRuleResponse.parse(result);
      },
    }),
  readOnlyHint: true,
});
