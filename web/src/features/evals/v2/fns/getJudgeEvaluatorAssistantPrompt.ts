import type { EvaluatorAssistantSampleObservation } from "@/src/features/evals/v2/types/EvaluatorAssistantSampleObservation";
import { getEvaluatorAuthoringPrompt } from "@/src/features/evals/v2/fns/getEvaluatorAuthoringPrompt";

export function getJudgeEvaluatorAssistantPrompt({
  evaluatorId,
  request,
  sampleObservation,
  mode = "create",
}: {
  evaluatorId: string;
  request: string;
  sampleObservation?: EvaluatorAssistantSampleObservation | null;
  mode?: "create" | "edit";
}) {
  return getEvaluatorAuthoringPrompt({
    evaluatorId,
    mode,
    currentType: "LLM_AS_JUDGE",
    request,
    sampleObservation,
  });
}
