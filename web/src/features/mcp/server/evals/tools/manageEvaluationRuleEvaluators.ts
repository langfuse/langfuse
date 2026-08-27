import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createMcpRuleService, toStoredAssignments } from "../rule-service";
import {
  AttachEvaluatorToEvaluationRuleBaseSchema,
  DetachEvaluatorFromEvaluationRuleInputSchema,
  EvaluationRuleEvaluatorMutationResponseSchema,
} from "../rule-schema";

export const [
  attachEvaluatorToEvaluationRuleTool,
  handleAttachEvaluatorToEvaluationRule,
] = defineTool({
  name: "attachEvaluatorToEvaluationRule",
  description: [
    "Attach a project evaluator to an observation evaluation rule using their stable IDs.",
    "For LLM evaluators, omit variableMapping to inherit the evaluator version's mapping or provide an override. Code evaluators must omit variableMapping.",
  ].join(" "),
  baseSchema: AttachEvaluatorToEvaluationRuleBaseSchema,
  inputSchema: AttachEvaluatorToEvaluationRuleBaseSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluation_rules.attach_evaluator",
      context,
      attributes: {
        "mcp.evaluation_rule_id": input.evaluationRuleId,
        "mcp.evaluator_id": input.evaluatorId,
      },
      fn: async () => {
        const [assignment] = toStoredAssignments([input]);
        await createMcpRuleService(context).attach({
          projectId: context.projectId,
          ruleId: input.evaluationRuleId,
          assignment: assignment!,
        });
        return EvaluationRuleEvaluatorMutationResponseSchema.parse({
          evaluationRuleId: input.evaluationRuleId,
          evaluatorId: input.evaluatorId,
        });
      },
    }),
  destructiveHint: true,
});

export const [
  detachEvaluatorFromEvaluationRuleTool,
  handleDetachEvaluatorFromEvaluationRule,
] = defineTool({
  name: "detachEvaluatorFromEvaluationRule",
  description:
    "Detach a project evaluator from an observation evaluation rule using their stable IDs.",
  baseSchema: DetachEvaluatorFromEvaluationRuleInputSchema,
  inputSchema: DetachEvaluatorFromEvaluationRuleInputSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluation_rules.detach_evaluator",
      context,
      attributes: {
        "mcp.evaluation_rule_id": input.evaluationRuleId,
        "mcp.evaluator_id": input.evaluatorId,
      },
      fn: async () => {
        await createMcpRuleService(context).detach({
          projectId: context.projectId,
          ruleId: input.evaluationRuleId,
          evaluatorId: input.evaluatorId,
        });
        return EvaluationRuleEvaluatorMutationResponseSchema.parse(input);
      },
    }),
  destructiveHint: true,
});
