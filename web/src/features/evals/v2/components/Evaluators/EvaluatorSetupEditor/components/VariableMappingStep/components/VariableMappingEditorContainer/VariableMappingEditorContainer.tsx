import { memo, useMemo, useRef } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { VariableMapping } from "@/src/features/evals/v2/components/VariableMapping/VariableMapping";
import { buildEvaluatorVariableMappings } from "@/src/features/evals/v2/fns/variableMapping/buildEvaluatorVariableMappings";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

const StableVariableMapping = memo(VariableMapping);

export function VariableMappingEditorContainer({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const resolvedSample = useEvaluatorSetupSample({ projectId, store });
  const state = useStore(
    store,
    useShallow((state) => ({
      promptMessages: state.promptMessages,
      variableFields: state.variableFields,
      activeMapping: state.activeMapping,
      selectedObservationId: state.selectedObservation?.id ?? null,
      actions: state.actions,
    })),
  );
  const mappings = useMemo(
    () =>
      buildEvaluatorVariableMappings({
        promptMessages: state.promptMessages,
        variableFields: state.variableFields,
      }),
    [state.promptMessages, state.variableFields],
  );
  const lastCompletedSample = useRef(resolvedSample);

  if (!state.selectedObservationId) lastCompletedSample.current = null;
  else if (resolvedSample) lastCompletedSample.current = resolvedSample;

  const displayedSample = resolvedSample ?? lastCompletedSample.current;

  return (
    <StableVariableMapping
      mode="editable"
      mappings={mappings}
      activeMapping={state.activeMapping}
      onActiveMappingChange={state.actions.setActiveMapping}
      onChangeField={state.actions.setVariableField}
      sourceObject={displayedSample}
      hasMatchingObservations={Boolean(displayedSample)}
      sourceUnavailableMessage="Select a sample observation in the test panel to preview mapped values."
    />
  );
}
