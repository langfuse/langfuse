import type { EvaluatorAssistantSampleObservation } from "@/src/features/evals/v2/types/EvaluatorAssistantSampleObservation";
import { getEvaluatorAuthoringPrompt } from "@/src/features/evals/v2/fns/getEvaluatorAuthoringPrompt";

export function getCodeEvaluatorAssistantPrompt({
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
    currentType: "CODE",
    request,
    sampleObservation,
  });
}
