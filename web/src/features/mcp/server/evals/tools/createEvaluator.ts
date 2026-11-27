import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { buildEvaluatorUrl } from "@langfuse/shared/src/server";
import { createMcpEvaluatorService } from "../evaluator-service";
import {
  McpEvaluatorInput,
  McpEvaluatorInputBase,
  toEvaluatorServiceInput,
} from "./evaluatorInput";

export const [createEvaluatorTool, handleCreateEvaluator] = defineTool({
  name: "createEvaluator",
  description: [
    "Create a new evaluator from name, type, and that type's definition fields (see each field).",
    "The returned `id` is the evaluatorId for getEvaluator, updateEvaluator, testEvaluator, and deleteEvaluator.",
    'Example: {"name": "Helpfulness", "type": "LLM_AS_JUDGE", "prompt": "Rate how helpful {{output}} is for {{input}}.", "outputDefinition": {"dataType": "NUMERIC", "reasoning": {"description": "Why the score was assigned"}, "score": {"description": "Helpfulness from 0 to 1"}}, "variableMapping": [{"templateVariable": "input", "selectedColumnId": "input"}, {"templateVariable": "output", "selectedColumnId": "output"}]}.',
  ].join(" "),
  action: "evaluator:CUD",
  baseSchema: McpEvaluatorInputBase,
  inputSchema: McpEvaluatorInput,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.create",
      context,
      attributes: {
        "mcp.evaluator_name": input.name,
        "mcp.evaluator_type": input.type,
      },
      fn: async (span) => {
        const service = createMcpEvaluatorService(context);
        const evaluator = await service.create(
          {
            ...toEvaluatorServiceInput(input),
            projectId: context.projectId,
          },
          context.userId ?? null,
        );
        span.setAttribute("mcp.evaluator_id", evaluator.id);
        return {
          ...evaluator,
          url: buildEvaluatorUrl({
            projectId: context.projectId,
            evaluatorId: evaluator.id,
          }),
        };
      },
    }),
  annotations: { destructiveHint: false },
});
