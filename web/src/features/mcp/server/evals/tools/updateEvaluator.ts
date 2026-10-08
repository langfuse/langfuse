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
    "The evaluator type may be changed on the same stable id only while it is not assigned to an evaluation rule.",
    "For `LLM_AS_JUDGE`, provide either prompt or structured promptMessages, plus outputDefinition. Prefer promptMessages when preserving message roles. Omit modelConfig to use the project default, or provide modelConfig with provider, model, and optional modelParams. For `CODE`, provide sourceCode + sourceCodeLanguage. For `DECISION_MODEL`, provide questions, a modelConfig with provider and model only, and variableMapping entries defining its state. Use an OpenAI connection with an allowlisted decision model (currently `gpt-6-luna`), or a TypeSafe connection.",
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
          { allowTypeChange: true },
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
