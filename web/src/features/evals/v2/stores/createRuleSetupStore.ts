import { createStore } from "zustand/vanilla";
import { ScoreResultTriggerSchema } from "@langfuse/shared";

import type {
  RuleDraft,
  RuleSetupStore,
} from "@/src/features/evals/v2/types/rules";

export function createRuleSetupStore(initialDraft: RuleDraft): RuleSetupStore {
  return createStore<ReturnType<RuleSetupStore["getState"]>>((set) => ({
    ...initialDraft,
    initialDraft,
    selectedObservation: null,
    previewSourceRuleId: null,
    previewFilter: [],
    actions: {
      setName: (name) => set({ name }),
      setFilter: (filter) => set({ filter }),
      setSampling: (sampling) => set({ sampling }),
      attachEvaluator: (assignment) =>
        set((state) => ({ assignments: [...state.assignments, assignment] })),
      detachEvaluator: (evaluatorId) =>
        set((state) => ({
          assignments: state.assignments.filter(
            (assignment) => assignment.evaluatorId !== evaluatorId,
          ),
        })),
      setVariableMapping: (evaluatorId, variableMapping) =>
        set((state) => ({
          assignments: state.assignments.map((assignment) =>
            assignment.evaluatorId === evaluatorId
              ? { ...assignment, variableMapping }
              : assignment,
          ),
        })),
      setSelectedObservation: (selectedObservation) =>
        set({ selectedObservation }),
      setTriggerKind: (triggerKind) => set({ triggerKind }),
      setScoreResultTrigger: (scoreResultTrigger) =>
        set({ scoreResultTrigger }),
      setPreviewSourceRuleId: (previewSourceRuleId) =>
        set({ previewSourceRuleId }),
      setPreviewFilter: (previewFilter) => set({ previewFilter }),
    },
  }));
}

export function isRuleDraftDirty(
  state: ReturnType<RuleSetupStore["getState"]>,
): boolean {
  return (
    JSON.stringify({
      name: state.name,
      filter: state.filter,
      sampling: state.sampling,
      triggerKind: state.triggerKind,
      scoreResultTrigger: state.scoreResultTrigger,
      assignments: state.assignments,
    }) !== JSON.stringify(state.initialDraft)
  );
}

export function isRuleDraftValid(
  state: ReturnType<RuleSetupStore["getState"]>,
  requireAssignments = true,
  allowMissingScoreResultTrigger = false,
) {
  if (requireAssignments && state.assignments.length === 0) return false;
  if (state.triggerKind === "OBSERVATION") return true;
  if (allowMissingScoreResultTrigger && state.scoreResultTrigger === null) {
    return true;
  }
  return ScoreResultTriggerSchema.safeParse(state.scoreResultTrigger).success;
}
