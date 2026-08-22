import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  EvaluationRulesResponseSchema,
  ListEvaluationRulesBaseSchema,
  ListEvaluationRulesInputSchema,
} from "../rule-schema";
import { createMcpRuleService, toMcpEvaluationRule } from "../rule-service";

export const [listEvaluationRulesTool, handleListEvaluationRules] = defineTool({
  name: "listEvaluationRules",
  description:
    "List observation evaluation rules in the current Langfuse project, including all evaluator assignments. Results are paginated.",
  baseSchema: ListEvaluationRulesBaseSchema,
  inputSchema: ListEvaluationRulesInputSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluation_rules.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const { rules, totalItems } = await createMcpRuleService(context).list({
          projectId: context.projectId,
          ...input,
        });
        return EvaluationRulesResponseSchema.parse({
          data: rules.map(toMcpEvaluationRule),
          meta: {
            page: input.page,
            limit: input.limit,
            totalItems,
            totalPages: Math.ceil(totalItems / input.limit),
          },
        });
      },
    }),
  readOnlyHint: true,
});
