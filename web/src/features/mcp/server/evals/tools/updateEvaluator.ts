import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { buildEvaluatorUrl } from "@langfuse/shared/src/server";
import { createMcpEvaluatorService } from "../evaluator-service";
import {
  McpUpdateEvaluatorInput,
  McpUpdateEvaluatorInputBase,
  toEvaluatorServiceInput,
} from "./evaluatorInput";

export const [updateEvaluatorTool, handleUpdateEvaluator] = defineTool({
  name: "updateEvaluator",
  description: [
    "Update an evaluator by stable id. Definition changes append an immutable version; name and description changes do not.",
    "For `LLM_AS_JUDGE`, provide prompt + outputDefinition and optionally modelConfig. For `CODE`, provide sourceCode + sourceCodeLanguage. For `DECISION_MODEL`, provide questions, an explicit TypeSafe modelConfig, and variableMapping entries defining its state.",
  ].join(" "),
  action: "evaluator:CUD",
  baseSchema: McpUpdateEvaluatorInputBase,
  inputSchema: McpUpdateEvaluatorInput,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluators.update",
      context,
      attributes: {
        "mcp.evaluator_id": input.evaluatorId,
        "mcp.evaluator_name": input.name,
        "mcp.evaluator_type": input.type,
      },
      fn: async () => {
        const service = createMcpEvaluatorService(context);
        const evaluator = await service.update(
          {
            ...toEvaluatorServiceInput(input),
            evaluatorId: input.evaluatorId,
            projectId: context.projectId,
          },
          context.userId ?? null,
        );
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
