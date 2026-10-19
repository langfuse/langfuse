import z from "zod";

import { IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME } from "./constants";
import {
  InAppAgentQuestionnaireAnswersSchema,
  resolveInAppAgentQuestionnaireAnswers,
} from "./questionnaire";

/**
 * User input sent with a tool approval, keyed by the tool that consumes it.
 * The worker hands each tool its own entry as resume data.
 */
export const InAppAgentToolInputsSchema = z.strictObject({
  [IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME]: z
    .object({ answers: InAppAgentQuestionnaireAnswersSchema })
    .optional(),
});

export type InAppAgentToolInputs = z.infer<typeof InAppAgentToolInputsSchema>;

export type InAppAgentToolWithInputs = keyof InAppAgentToolInputs;

type ToolInputValidationResult =
  | { success: true }
  | { success: false; error: string };

type ToolInputValidators = {
  [ToolName in InAppAgentToolWithInputs]: (params: {
    args: unknown;
    input: NonNullable<InAppAgentToolInputs[ToolName]>;
  }) => ToolInputValidationResult;
};

// Checks the input against the tool call the model persisted, so the worker
// never resumes a tool with input that does not fit its arguments.
const toolInputValidators: ToolInputValidators = {
  [IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME]: ({ args, input }) =>
    resolveInAppAgentQuestionnaireAnswers({ args, answers: input.answers }),
};

export function isInAppAgentToolWithInputs(
  toolName: string,
): toolName is InAppAgentToolWithInputs {
  return Object.hasOwn(toolInputValidators, toolName);
}

/**
 * Tool inputs are only accepted for an approved call of a tool that takes
 * input, and such a tool cannot be approved without them.
 */
export function validateInAppAgentToolInputs(params: {
  toolName: string;
  args: unknown;
  approved: boolean;
  toolInputs: InAppAgentToolInputs | undefined;
}): ToolInputValidationResult {
  const { toolName, args, approved, toolInputs } = params;
  const providedToolNames = Object.entries(toolInputs ?? {}).flatMap(
    ([name, input]) => (input === undefined ? [] : [name]),
  );
  const acceptsInput = approved && isInAppAgentToolWithInputs(toolName);

  if (providedToolNames.some((name) => !acceptsInput || name !== toolName)) {
    return {
      success: false,
      error: "Tool inputs are only accepted for the approved tool",
    };
  }
  if (!acceptsInput) {
    return { success: true };
  }

  const input = toolInputs?.[toolName];
  if (input === undefined) {
    return { success: false, error: "This tool requires input to approve" };
  }
  return toolInputValidators[toolName]({ args, input });
}
