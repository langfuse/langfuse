import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  UpdateEvaluationRuleBaseSchema,
  UpdateEvaluationRuleInputSchema,
} from "../rule-schema";
import {
  createMcpRuleService,
  toMcpEvaluationRule,
  toStoredAssignments,
} from "../rule-service";

export const [updateEvaluationRuleTool, handleUpdateEvaluationRule] =
  defineTool({
    name: "updateEvaluationRule",
    description:
      "Update an observation evaluation rule, including replacing all evaluator assignments.",
    baseSchema: UpdateEvaluationRuleBaseSchema,
    inputSchema: UpdateEvaluationRuleInputSchema,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.evaluation_rules.update",
        context,
        attributes: { "mcp.evaluation_rule_id": input.evaluationRuleId },
        fn: async () => {
          const { evaluationRuleId, evaluatorAssignments, ...patch } = input;
          const rule = await createMcpRuleService(context).update({
            projectId: context.projectId,
            ruleId: evaluationRuleId,
            ...patch,
            ...(evaluatorAssignments === undefined
              ? {}
              : {
                  evaluatorMappings: toStoredAssignments(evaluatorAssignments),
                }),
          });
          return toMcpEvaluationRule(rule);
        },
      }),
    destructiveHint: true,
  });
