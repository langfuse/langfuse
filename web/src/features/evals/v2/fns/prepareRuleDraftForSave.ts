import type { RuleDraft } from "@/src/features/evals/v2/types/rules";

export function prepareRuleDraftForSave(draft: RuleDraft): RuleDraft {
  return draft.triggerKind === "SCORE_RESULT"
    ? { ...draft, filter: [], sampling: 1 }
    : { ...draft, scoreResultTrigger: null };
}
