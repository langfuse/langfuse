import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import type { EvaluatorSetupStoreState } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

/**
 * What counts as an unsaved edit. The fallback decision model is applied on
 * save, not stored, so it is left out.
 */
export function evaluatorSetupSnapshot(
  state: Parameters<typeof prepareEvaluatorDraft>[0] &
    Pick<
      EvaluatorSetupStoreState,
      "name" | "description" | "traceVariableFields"
    >,
) {
  return JSON.stringify({
    name: state.name.trim(),
    description: state.description.trim() || null,
    definition: prepareEvaluatorDraft(state).definition,
    traceVariableFields: state.traceVariableFields,
  });
}
