import { forwardRef, useImperativeHandle, useState } from "react";
import { useStore } from "zustand";

import { Button } from "@/src/components/ui/button";
import {
  createRuleSetupStore,
  EvaluatorAssignmentsEditor,
  isRuleDraftDirty,
  type RuleDraft,
  type RuleEvaluatorOption,
} from "@/src/features/evals";
import type { ExperimentEvaluatorAssignmentsHandle } from "@/src/features/experiments/components/ExperimentEvaluatorAssignments/types/experimentEvaluatorAssignmentsHandle";

export const ExperimentEvaluatorAssignmentsEditor = forwardRef<
  ExperimentEvaluatorAssignmentsHandle,
  {
    evaluatorOptions: RuleEvaluatorOption[];
    initialAssignments: RuleDraft["assignments"];
    sampleObject: Record<string, unknown> | null;
    unvalidatedSourceColumnIds?: string[];
    search: string;
    onSearchChange: (value: string) => void;
    onSaveAssignments: (assignments: RuleDraft["assignments"]) => Promise<void>;
    disabled?: boolean;
    showSaveButton?: boolean;
  }
>(function ExperimentEvaluatorAssignmentsEditor(
  {
    evaluatorOptions,
    initialAssignments,
    sampleObject,
    unvalidatedSourceColumnIds,
    search,
    onSearchChange,
    onSaveAssignments,
    disabled = false,
    showSaveButton = true,
  },
  ref,
) {
  const [store] = useState(() =>
    createRuleSetupStore({
      name: "Experiment evaluators",
      filter: [],
      sampling: 1,
      assignments: initialAssignments,
    }),
  );
  const isDirty = useStore(store, isRuleDraftDirty);

  const save = async () => {
    if (disabled || !isDirty) return;

    const state = store.getState();
    await onSaveAssignments(state.assignments);
    store.setState({
      initialDraft: {
        name: state.name,
        filter: state.filter,
        sampling: state.sampling,
        assignments: state.assignments,
      },
    });
  };
  useImperativeHandle(ref, () => ({ save }));

  return (
    <div className="space-y-3">
      <EvaluatorAssignmentsEditor
        evaluatorOptions={evaluatorOptions}
        store={store}
        search={search}
        onSearchChange={onSearchChange}
        sampleObject={sampleObject}
        unvalidatedSourceColumnIds={unvalidatedSourceColumnIds}
        costEstimates={[]}
        estimatingEvaluatorIds={[]}
        footerTrailing={null}
        emptyDescription="Attach an evaluator to score experiments on this dataset."
        sourceUnavailableMessage="No dataset item is available to validate JSON paths."
        disabled={disabled}
      />
      {showSaveButton ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={disabled || !isDirty}
            onClick={() => {
              save().catch(() => {
                // The mutation displays its error toast and the draft remains dirty.
              });
            }}
          >
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
});
