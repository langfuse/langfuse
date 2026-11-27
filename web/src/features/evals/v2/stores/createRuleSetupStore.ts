import {
  EvalTargetObject,
  TRACE_TRANSCRIPT_EVAL_COLUMN,
  type FilterState,
} from "@langfuse/shared";
import isEqual from "lodash/isEqual";
import { createStore } from "zustand/vanilla";

import type {
  RuleDraft,
  RuleSetupStore,
  RuleTargetObject,
} from "@/src/features/evals/v2/types/rules";

export function createRuleSetupStore(
  initialDraft: RuleDraft,
  targetSetup: {
    targetObject: RuleTargetObject;
    /** Switching target swaps the filter while it still equals the current target's default. */
    defaultFilterFor?: (targetObject: RuleTargetObject) => FilterState;
  } = { targetObject: EvalTargetObject.EVENT },
): RuleSetupStore {
  const { defaultFilterFor } = targetSetup;
  return createStore<ReturnType<RuleSetupStore["getState"]>>((set) => ({
    ...initialDraft,
    initialDraft,
    selectedObservation: null,
    targetObject: targetSetup.targetObject,
    actions: {
      setName: (name) => set({ name }),
      setFilter: (filter) => set({ filter }),
      setSampling: (sampling) => set({ sampling }),
      setTargetObject: (targetObject) =>
        set((state) => ({
          targetObject,
          ...(defaultFilterFor &&
          isEqual(state.filter, defaultFilterFor(state.targetObject))
            ? { filter: defaultFilterFor(targetObject) }
            : {}),
          assignments: state.assignments.map((assignment) =>
            assignment.variableMapping?.some(
              ({ selectedColumnId }) =>
                selectedColumnId === TRACE_TRANSCRIPT_EVAL_COLUMN,
            )
              ? { ...assignment, variableMapping: null }
              : assignment,
          ),
        })),
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
