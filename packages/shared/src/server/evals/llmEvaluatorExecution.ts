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
  type ModelParams,
  type TraceSinkParams,
} from "../llm/types";
import {
  createLLMOutput,
  generateLLMText,
  mapLegacyLLMCompletionParams,
  type LLMConnection,
} from "../llm/llmText";
import { compileLangfuseMediaMessages } from "../llm/mediaMessages";
import { z } from "zod";

const MODEL_FACING_OUTPUT_SCHEMA_DESCRIPTION =
  'Return only top-level "score" and "scoreExplanation". Put other requested fields inside "scoreExplanation".';

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

/**
 * The single model call behind live and test LLM-as-a-judge runs, so a test
 * run sends the provider exactly what a live run sends.
 *
 * The model sees `scoreExplanation` instead of `reasoning`: thinking-capable
 * models treat a `reasoning` field as their scratchpad and drop the score.
 * The output is mapped back to the `{ score, reasoning }` evaluator contract.
 */
export async function generateLlmEvaluatorOutput(params: {
  projectId: string;
  connection: LLMConnection;
  modelParams: ModelParams;
  messages: ChatMessage[];
  outputResultSchema: z.ZodObject<{ reasoning: z.ZodString; score: z.ZodType }>;
  trace: TraceSinkParams;
}) {
  const llmParams = mapLegacyLLMCompletionParams({
    connection: params.connection,
    messages: params.messages,
    modelParams: params.modelParams,
  });
  const { providerMessages, traceMessages } =
    await compileLangfuseMediaMessages({
      projectId: params.projectId,
      messages: params.messages,
      adapter: params.modelParams.adapter,
    });
  const modelFacingOutputSchema = z
    .object({
      scoreExplanation: params.outputResultSchema.shape.reasoning,
      score: params.outputResultSchema.shape.score,
    })
    .describe(MODEL_FACING_OUTPUT_SCHEMA_DESCRIPTION);

  const result = await generateLLMText({
    ...llmParams,
    messages: providerMessages,
    traceInput: traceMessages,
    output: createLLMOutput(modelFacingOutputSchema),
    maxRetries: 1,
    trace: params.trace,
  });

  return {
    output: {
      score: result.output.score,
      reasoning: result.output.scoreExplanation,
    },
    usage: result.usage,
    providerMessages,
    modelFacingOutputSchema,
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
