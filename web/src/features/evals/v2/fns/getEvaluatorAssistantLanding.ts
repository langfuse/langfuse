import type { InAppAgentContextualLanding } from "@/src/features/in-app-agent";
import { EVALUATOR_ASSISTANT_LANDING_CONFIG } from "@/src/features/evals/v2/constants/evaluatorAssistantLanding";

export function getEvaluatorAssistantLanding({
  id,
  mode,
  evaluatorType,
  onSubmit,
}: {
  id: string;
  mode: "create" | "edit";
  evaluatorType: "CODE" | "LLM_AS_JUDGE" | "DECISION_MODEL";
  onSubmit: (input: string) => Promise<boolean>;
}): InAppAgentContextualLanding {
  return {
    id,
    ...EVALUATOR_ASSISTANT_LANDING_CONFIG[mode][evaluatorType],
    onSubmit,
  };
}
