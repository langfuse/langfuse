import type { RuleDraft } from "@/src/features/evals/v2/types/rules";
import { EvalTargetObject } from "@langfuse/shared";

export function prepareRuleDraftForSave(draft: RuleDraft): RuleDraft {
  return draft.targetObject === EvalTargetObject.SCORE_RESULT
    ? { ...draft, filter: [], sampling: 1 }
    : { ...draft, scoreResultTrigger: null };
}
