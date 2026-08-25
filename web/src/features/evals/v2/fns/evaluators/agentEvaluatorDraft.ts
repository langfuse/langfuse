import type { InAppAgentLlmEvaluatorDraft } from "@langfuse/shared/in-app-agent";

import type { EvaluatorSetupDraft } from "@/src/features/evals/v2/types/templateGallery";
import type { EvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

export function agentEvaluatorDraftToSetupDraft(
  draft: InAppAgentLlmEvaluatorDraft,
): EvaluatorSetupDraft {
  return {
    name: draft.name,
    description: draft.description,
    definition: draft.definition as EvaluatorDefinition,
  };
}
