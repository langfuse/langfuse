import { EvalTargetObject } from "@langfuse/shared";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  CreateEvaluationRuleBaseSchema,
  CreateEvaluationRuleInputSchema,
} from "../rule-schema";
import {
  createMcpRuleService,
  toMcpEvaluationRule,
  toStoredAssignments,
} from "../rule-service";

export const [createEvaluationRuleTool, handleCreateEvaluationRule] =
  defineTool({
    name: "createEvaluationRule",
    description: [
      "Create an observation evaluation rule with one or more evaluator assignments. While enabled, the rule continuously runs its evaluators on new observations matching the filter (sampled at `sampling`), which incurs model or code execution cost per evaluated observation. To evaluate existing observations, use runBatchEvaluation.",
      "Each assignment references a project evaluator by ID from listEvaluators or createEvaluator. LLM-as-a-judge and decision-model assignments may override their variable mapping; code evaluator assignments must omit it.",
    ].join(" "),
    action: "evaluationRule:CUD",
    baseSchema: CreateEvaluationRuleBaseSchema,
    inputSchema: CreateEvaluationRuleInputSchema,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.evaluation_rules.create",
        context,
        attributes: {
          "mcp.evaluation_rule_name": input.name,
          "mcp.evaluation_rule_evaluator_count":
            input.evaluatorAssignments.length,
        },
        fn: async (span) => {
          const evaluationRule = await createMcpRuleService(context).create(
            {
              projectId: context.projectId,
              name: input.name,
              targetObject: EvalTargetObject.EVENT,
              enabled: input.enabled,
              sampling: input.sampling,
              filter: input.filter ?? [],
              evaluatorAssignments: toStoredAssignments(
                input.evaluatorAssignments,
              ),
            },
            context.userId ?? null,
          );
          span.setAttribute("mcp.evaluation_rule_id", evaluationRule.id);
          return toMcpEvaluationRule(evaluationRule);
        },
      }),
    destructiveHint: false,
  });
