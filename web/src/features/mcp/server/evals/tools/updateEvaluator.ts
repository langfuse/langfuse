import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  buildEvaluatorUrl,
  DECISION_MODEL_CONNECTIONS_HINT,
} from "@langfuse/shared/src/server";
import { createMcpEvaluatorService } from "../evaluator-service";
import {
  EVALUATOR_DEFINITION_FIELDS_DESCRIPTION,
  McpUpdateEvaluatorInput,
  McpUpdateEvaluatorInputBase,
  toEvaluatorServiceInput,
} from "./evaluatorInput";

export const [updateEvaluatorTool, handleUpdateEvaluator] = defineTool({
  name: "updateEvaluator",
  description: [
    "Replace an evaluator's name, description, and definition by stable id.",
    "This is a full replacement, not a partial patch: every call must include evaluatorId, name, type, and the complete definition fields for that type, even to change only the name or description. Omitted optional fields, including description, are cleared.",
    "Get evaluatorId from the `id` returned by listEvaluators or createEvaluator.",
    "To change part of an evaluator, first call getEvaluator and resend its current values: name, description, type, and from the latest entry in `versions` the definition (`promptMessages` content as prompt, outputDefinition, variableMapping, and provider, model, and modelParams as modelConfig for `LLM_AS_JUDGE`; sourceCode and sourceCodeLanguage for `CODE`; questions, provider and model as modelConfig, and variableMapping for `DECISION_MODEL`).",
    "Inputs never accept null, including nested fields: drop every null that getEvaluator returns, such as description, variableMapping, modelParams, and each variableMapping entry's jsonSelector, and omit modelConfig entirely when provider and model are null (the evaluator uses the project default model).",
    "prompt is saved as a single user message: when the latest `promptMessages` has more than one entry or a non-user role, this tool would flatten it and change evaluation behavior, so do not update that evaluator here; ask the user to edit it in the Langfuse UI instead.",
    "Definition changes append an immutable version; name and description changes do not.",
    EVALUATOR_DEFINITION_FIELDS_DESCRIPTION,
    `Use ${DECISION_MODEL_CONNECTIONS_HINT}.`,
    "Call listLlmConnections to find valid modelConfig provider names and models.",
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
