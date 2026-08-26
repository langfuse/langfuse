import {
  parseEvaluatorChatPrompt,
  serializeEvaluatorChatPrompt,
} from "../../features/evals/evaluatorChatPrompt";
import {
  compilePersistedEvalOutputDefinition,
  validateEvalOutputResult,
  type CompiledEvalOutputDefinition,
  type PersistedEvalOutputDefinition,
} from "../../features/evals/outputDefinition";
import { compileEvalPrompt } from "../../utils/prompts";
import type { ExtractedVariable } from "./extractObservationVariables";
import { ChatMessageRole, ChatMessageType } from "../llm/types";

function buildEvalMessages(prompt: string) {
  const messages = parseEvaluatorChatPrompt(prompt);
  if (!messages) {
    return [
      {
        type: ChatMessageType.User,
        role: ChatMessageRole.User,
        content: prompt,
      } as const,
    ];
  }

  return messages.map((message) => {
    switch (message.role) {
      case "system":
        return {
          type: ChatMessageType.System,
          role: ChatMessageRole.System,
          content: message.content,
        } as const;
      case "assistant":
        return {
          type: ChatMessageType.AssistantText,
          role: ChatMessageRole.Assistant,
          content: message.content,
        } as const;
      case "user":
        return {
          type: ChatMessageType.User,
          role: ChatMessageRole.User,
          content: message.content,
        } as const;
    }
  });
}

export async function executeLlmEvaluator(params: {
  templatePrompt: string;
  variables: ExtractedVariable[];
  outputDefinition: PersistedEvalOutputDefinition;
  callLlm: (params: {
    messages: ReturnType<typeof buildEvalMessages>;
    compiledOutputDefinition: CompiledEvalOutputDefinition;
    interpolatedPrompt: string;
  }) => Promise<unknown>;
}) {
  const chatPrompt = parseEvaluatorChatPrompt(params.templatePrompt);
  const interpolatedPrompt = chatPrompt
    ? serializeEvaluatorChatPrompt(
        chatPrompt.map((message) => ({
          ...message,
          content: compileEvalPrompt({
            templatePrompt: message.content,
            variables: params.variables,
          }),
        })),
      )
    : compileEvalPrompt(params);
  const compiledOutputDefinition = compilePersistedEvalOutputDefinition(
    params.outputDefinition,
  );
  const response = await params.callLlm({
    messages: buildEvalMessages(interpolatedPrompt),
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
