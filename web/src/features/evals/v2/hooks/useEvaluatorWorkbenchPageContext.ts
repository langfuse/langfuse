import { useEffect } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { registerInAppAgentPageContext } from "@/src/features/in-app-agent";
import { EVALUATOR_WORKBENCH_CONTEXT_DESCRIPTION } from "@/src/features/evals/v2/fns/sanitizeEvaluatorWorkbenchContext";
import { getEvaluatorAssistantSampleObservation } from "@/src/features/evals/v2/fns/getEvaluatorAssistantSampleObservation";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { registerEvaluatorWorkbenchFilter } from "@/src/features/evals/v2/store/evaluatorWorkbenchFilterRegistry";

export function useEvaluatorWorkbenchPageContext({
  projectId,
  evaluatorId,
  mode,
  store,
}: {
  projectId: string;
  evaluatorId: string;
  mode: "create" | "edit";
  store: EvaluatorSetupStore;
}) {
  const workbench = useStore(
    store,
    useShallow((state) => ({
      evaluatorType: state.type,
      sampleFilter: state.sampleFilter,
      selectedObservation: state.selectedObservation,
      variables: state.stateKeys,
      variableFields: state.variableFields,
    })),
  );
  const selectedObservation = getEvaluatorAssistantSampleObservation(
    workbench.selectedObservation,
  );
  const mappings = Object.entries(workbench.variableFields).flatMap(
    ([variable, field]) =>
      field.selectedColumnId
        ? [
            {
              variable,
              selectedColumnId: field.selectedColumnId,
              ...(field.jsonSelector
                ? { jsonSelector: field.jsonSelector }
                : {}),
            },
          ]
        : [],
  );
  const contextValue = JSON.stringify({
    projectId,
    evaluatorId,
    mode,
    evaluatorType: workbench.evaluatorType,
    sampleFilter: workbench.sampleFilter,
    ...(selectedObservation ? { selectedObservation } : {}),
    draft: {
      variables: workbench.variables,
      mappings,
    },
  });

  useEffect(() => {
    return registerInAppAgentPageContext(
      projectId,
      `evaluator-workbench:${evaluatorId}`,
      [
        {
          description: EVALUATOR_WORKBENCH_CONTEXT_DESCRIPTION,
          value: contextValue,
        },
      ],
    );
  }, [contextValue, evaluatorId, projectId]);

  useEffect(() => {
    const unregister = registerEvaluatorWorkbenchFilter(
      projectId,
      evaluatorId,
      (filter) => {
        const state = store.getState();
        state.actions.setSampleFilter(filter);
        state.actions.setSelectedObservation(null);
      },
    );
    return () => {
      unregister();
    };
  }, [evaluatorId, projectId, store]);
}
