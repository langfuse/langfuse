import { getCodeEvaluatorAssistantPrompt } from "@/src/features/evals/v2/fns/getCodeEvaluatorAssistantPrompt";
import type { EvaluatorAssistantSampleObservation } from "@/src/features/evals/v2/types/EvaluatorAssistantSampleObservation";

export async function startCodeEvaluatorAssistantHandoff({
  request,
  sampleObservation,
  conversationId,
  openAssistant,
  persistEvaluator,
  submitToAssistant,
}: {
  request: string;
  conversationId: string;
  sampleObservation?: EvaluatorAssistantSampleObservation | null;
  openAssistant: () => boolean;
  persistEvaluator: () => Promise<string | null>;
  submitToAssistant: (
    prompt: string,
    options: {
      newConversation: true;
      conversationId: string;
      entryPoint: "code-evaluator-editor";
    },
  ) => Promise<boolean>;
}) {
  if (!openAssistant()) return null;

  const evaluatorId = await persistEvaluator();
  if (!evaluatorId) return null;

  const started = await submitToAssistant(
    getCodeEvaluatorAssistantPrompt({
      evaluatorId,
      request,
      sampleObservation,
    }),
    {
      newConversation: true,
      conversationId,
      entryPoint: "code-evaluator-editor",
    },
  );

  return { evaluatorId, started };
}
