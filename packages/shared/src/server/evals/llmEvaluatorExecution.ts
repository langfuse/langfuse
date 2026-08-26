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
  return [
    {
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: prompt,
    } as const,
  ];
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
  const interpolatedPrompt = compileEvalPrompt(params);
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
