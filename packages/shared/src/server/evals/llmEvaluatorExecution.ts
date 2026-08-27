import {
  compilePersistedEvalOutputDefinition,
  validateEvalOutputResult,
  type CompiledEvalOutputDefinition,
  type PersistedEvalOutputDefinition,
} from "../../features/evals/outputDefinition";
import type { PersistedEvaluatorPromptMessages } from "../../features/evals/types";
import { compileEvalPrompt } from "../../utils/prompts";
import type { ExtractedVariable } from "./extractObservationVariables";
import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
} from "../llm/types";

function buildEvalMessages(params: {
  promptMessages: PersistedEvaluatorPromptMessages;
  variables: ExtractedVariable[];
}): ChatMessage[] {
  return params.promptMessages.map((message): ChatMessage => {
    const content = compileEvalPrompt({
      templatePrompt: message.content,
      variables: params.variables,
    });
    if (message.role === "system") {
      return {
        type: ChatMessageType.System,
        role: ChatMessageRole.System,
        content,
      };
    }
    if (message.role === "assistant") {
      return {
        type: ChatMessageType.AssistantText,
        role: ChatMessageRole.Assistant,
        content,
      };
    }
    return {
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content,
    };
  });
}

export async function executeLlmEvaluator(params: {
  promptMessages: PersistedEvaluatorPromptMessages;
  variables: ExtractedVariable[];
  outputDefinition: PersistedEvalOutputDefinition;
  callLlm: (params: {
    messages: ChatMessage[];
    compiledOutputDefinition: CompiledEvalOutputDefinition;
    interpolatedPrompt: string;
  }) => Promise<unknown>;
}) {
  const messages = buildEvalMessages(params);
  const interpolatedPrompt = messages
    .map(({ content }) => content)
    .join("\n\n");
  const compiledOutputDefinition = compilePersistedEvalOutputDefinition(
    params.outputDefinition,
  );
  const response = await params.callLlm({
    messages,
    compiledOutputDefinition,
    interpolatedPrompt,
  });

  return {
    interpolatedPrompt,
    compiledOutputDefinition,
    output: validateEvalOutputResult({
      response,
      compiledOutputDefinition,
    }),
  };
}
