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
    "Replace an evaluator's name, description, and definition by id.",
    "Full replacement, not a patch: every call needs name, type, and the complete definition fields for that type, even to change only the name; omitted optional fields, including description, are cleared.",
    "To change part of an evaluator, call getEvaluator and resend its current values: name, description, type, and from `versions[0]` (the latest) the definition (`promptMessages` content as prompt, outputDefinition, variableMapping, and provider, model, and modelParams as modelConfig for `LLM_AS_JUDGE`; sourceCode and sourceCodeLanguage for `CODE`; questions, provider and model as modelConfig, and variableMapping for `DECISION_MODEL`).",
    "No input accepts null, nested fields included: drop every null getEvaluator returns (description, variableMapping, modelParams, each mapping's jsonSelector), and omit modelConfig when provider and model are null (the project default model is used).",
    "prompt is saved as a single user message: if the latest `promptMessages` has several entries or a non-user role, updating here would flatten it and change evaluation behavior; ask the user to edit it in the Langfuse UI instead.",
    "Definition changes append an immutable version; name and description changes do not.",
    "type must match the current type (changing it fails with a conflict; create a new evaluator instead). Langfuse-managed evaluators cannot be updated.",
    'Example renaming a code evaluator: {"evaluatorId": "<id>", "name": "New name", "description": "<current description>", "type": "CODE", "sourceCode": "<current sourceCode>", "sourceCodeLanguage": "PYTHON"}.',
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
