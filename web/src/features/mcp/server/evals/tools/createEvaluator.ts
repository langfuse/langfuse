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
    "Create a new evaluator with a stable id. Names do not act as identity and may be reused.",
    "Set type to `LLM_AS_JUDGE` and provide prompt + outputDefinition. Omit modelConfig to use the project default, or provide modelConfig with provider, model, and optional modelParams. For `CODE`, provide sourceCode + sourceCodeLanguage.",
    "Use updateEvaluator with the returned evaluatorId to update it or append a new immutable definition version.",
  ].join(" "),
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
