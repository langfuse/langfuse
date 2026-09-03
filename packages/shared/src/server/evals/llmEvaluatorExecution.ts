import {
  compilePersistedEvalOutputDefinition,
  validateEvalOutputResult,
  type CompiledEvalOutputDefinition,
  type PersistedEvalOutputDefinition,
} from "../../features/evals/outputDefinition";
import type {
  EvaluatorPromptMessage,
  PersistedEvaluatorPromptMessages,
} from "../../features/evals/types";
import { compileEvalPrompt } from "../../utils/prompts";
import type { ExtractedVariable } from "./extractObservationVariables";
import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
} from "../llm/types";

const CHAT_MESSAGE_BUILDERS = {
  system: (content: string) => ({
    type: ChatMessageType.System,
    role: ChatMessageRole.System,
    content,
  }),
  user: (content: string) => ({
    type: ChatMessageType.User,
    role: ChatMessageRole.User,
    content,
  }),
  assistant: (content: string) => ({
    type: ChatMessageType.AssistantText,
    role: ChatMessageRole.Assistant,
    content,
  }),
} satisfies Record<
  EvaluatorPromptMessage["role"],
  (content: string) => ChatMessage
>;

function buildEvalMessages(params: {
  promptMessages: PersistedEvaluatorPromptMessages;
  variables: ExtractedVariable[];
}) {
  const messages = params.promptMessages.map((message) =>
    CHAT_MESSAGE_BUILDERS[message.role](
      compileEvalPrompt({
        templatePrompt: message.content,
        variables: params.variables,
      }),
    ),
  );

  return {
    messages,
    interpolatedPrompt: messages.map(({ content }) => content).join("\n\n"),
  };
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
  const { messages, interpolatedPrompt } = buildEvalMessages(params);
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
