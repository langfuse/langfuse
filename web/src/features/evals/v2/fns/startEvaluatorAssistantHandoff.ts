import { getEvaluatorAuthoringPrompt } from "@/src/features/evals/v2/fns/getEvaluatorAuthoringPrompt";
import type { EvaluatorAssistantSampleObservation } from "@/src/features/evals/v2/types/EvaluatorAssistantSampleObservation";

export async function startEvaluatorAssistantHandoff({
  request,
  mode,
  currentType,
  sampleObservation,
  conversationId,
  openAssistant,
  persistEvaluator,
  submitToAssistant,
}: {
  request: string;
  mode: "create" | "edit";
  currentType: "CODE" | "LLM_AS_JUDGE" | "DECISION_MODEL";
  conversationId: string;
  sampleObservation?: EvaluatorAssistantSampleObservation | null;
  openAssistant: () => boolean;
  persistEvaluator: () => Promise<string | null>;
  submitToAssistant: (
    prompt: string,
    options: {
      newConversation: true;
      conversationId: string;
      entryPoint: "code-evaluator-editor" | "judge-evaluator-editor";
    },
  ) => Promise<boolean>;
}) {
  if (!openAssistant()) return null;

  const evaluatorId = await persistEvaluator();
  if (!evaluatorId) return null;

  const started = await submitToAssistant(
    getEvaluatorAuthoringPrompt({
      evaluatorId,
      mode,
      currentType,
      request,
      sampleObservation,
    }),
    {
      newConversation: true,
      conversationId,
      entryPoint:
        currentType === "CODE"
          ? "code-evaluator-editor"
          : "judge-evaluator-editor",
    },
  );

  return { evaluatorId, started };
}
