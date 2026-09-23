import { memo, useMemo, useRef } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { DecisionModelStateEditor } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelStateEditor/DecisionModelStateEditor";
import { VariableMapping } from "@/src/features/evals/v2/components/VariableMapping/VariableMapping";
import { buildDecisionModelStateFields } from "@/src/features/evals/v2/fns/variableMapping/buildDecisionModelStateFields";
import { buildEvaluatorVariableMappings } from "@/src/features/evals/v2/fns/variableMapping/buildEvaluatorVariableMappings";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

const StableVariableMapping = memo(VariableMapping);

const SOURCE_UNAVAILABLE_MESSAGE =
  "Select a sample observation in the test panel to preview mapped values.";

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
      type: state.type,
      promptMessages: state.promptMessages,
      stateKeys: state.stateKeys,
      variableFields: state.variableFields,
      activeMapping: state.activeMapping,
      selectedObservationId: state.selectedObservation?.id ?? null,
      actions: state.actions,
    })),
  );
  const mappings = useMemo(
    () =>
      state.type === "DECISION_MODEL"
        ? buildDecisionModelStateFields({
            stateKeys: state.stateKeys,
            variableFields: state.variableFields,
          })
        : buildEvaluatorVariableMappings({
            promptMessages: state.promptMessages,
            variableFields: state.variableFields,
          }),
    [state.type, state.stateKeys, state.promptMessages, state.variableFields],
  );
  const lastCompletedSample = useRef(resolvedSample);

  if (!state.selectedObservationId) lastCompletedSample.current = null;
  else if (resolvedSample) lastCompletedSample.current = resolvedSample;

  const displayedSample = resolvedSample ?? lastCompletedSample.current;

  if (state.type === "DECISION_MODEL") {
    return (
      <DecisionModelStateEditor
        fields={mappings.map(({ variable, fieldState }) => ({
          key: variable,
          fieldState,
        }))}
        activeMapping={state.activeMapping}
        onActiveMappingChange={state.actions.setActiveMapping}
        onChangeField={state.actions.setVariableField}
        onAddField={state.actions.addStateKey}
        onRenameField={state.actions.renameStateKey}
        onRemoveField={state.actions.removeStateKey}
        sourceObject={displayedSample}
        hasMatchingObservations={Boolean(displayedSample)}
        sourceUnavailableMessage={SOURCE_UNAVAILABLE_MESSAGE}
      />
    );
  }

  return (
    <StableVariableMapping
      mode="editable"
      mappings={mappings}
      activeMapping={state.activeMapping}
      onActiveMappingChange={state.actions.setActiveMapping}
      onChangeField={state.actions.setVariableField}
      sourceObject={displayedSample}
      hasMatchingObservations={Boolean(displayedSample)}
      sourceUnavailableMessage={SOURCE_UNAVAILABLE_MESSAGE}
    />
  );
}
