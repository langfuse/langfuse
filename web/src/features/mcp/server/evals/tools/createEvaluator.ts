import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  buildEvaluatorUrl,
  DECISION_MODEL_CONNECTIONS_HINT,
} from "@langfuse/shared/src/server";
import { createMcpEvaluatorService } from "../evaluator-service";
import {
  EVALUATOR_DEFINITION_FIELDS_DESCRIPTION,
  McpEvaluatorInput,
  McpEvaluatorInputBase,
  toEvaluatorServiceInput,
} from "./evaluatorInput";

export const [createEvaluatorTool, handleCreateEvaluator] = defineTool({
  name: "createEvaluator",
  description: [
    "Create a new evaluator with a stable id. Names do not act as identity and may be reused.",
    "Every call must include name, type, and the definition fields for that type.",
    EVALUATOR_DEFINITION_FIELDS_DESCRIPTION,
    `Use ${DECISION_MODEL_CONNECTIONS_HINT}.`,
    "Call listLlmConnections to find valid modelConfig provider names and models.",
    "The returned `id` is the evaluatorId for getEvaluator, updateEvaluator, and deleteEvaluator.",
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
  destructiveHint: true,
});
