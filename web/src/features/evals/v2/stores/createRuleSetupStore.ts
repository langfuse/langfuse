import { createStore } from "zustand/vanilla";

import type {
  RuleDraft,
  RuleSetupStore,
} from "@/src/features/evals/v2/types/rules";

export function createRuleSetupStore(initialDraft: RuleDraft): RuleSetupStore {
  return createStore<ReturnType<RuleSetupStore["getState"]>>((set) => ({
    ...initialDraft,
    initialDraft,
    selectedObservation: null,
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
      assignments: state.assignments,
    }) !== JSON.stringify(state.initialDraft)
  );
}
