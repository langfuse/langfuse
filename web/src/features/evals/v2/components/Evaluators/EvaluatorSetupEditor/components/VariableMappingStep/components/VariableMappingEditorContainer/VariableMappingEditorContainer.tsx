import { memo, useMemo, useRef } from "react";
import {
  isTextAdapterDecisionModel,
  TopicsTargetObject,
} from "@langfuse/shared";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { DecisionModelStateEditor } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelStateEditor/DecisionModelStateEditor";
import { VariableMapping } from "@/src/features/evals/v2/components/VariableMapping/VariableMapping";
import {
  EvalVariableSourceColumnsProvider,
  TRACE_TRANSCRIPT_SOURCE_COLUMNS,
  useEvalVariableSourceColumns,
} from "@/src/features/evals/v2/contexts/EvalVariableSourceColumnsProvider";
import { previewOpenAIDecisionQuestions } from "@/src/features/evals/v2/fns/evaluators/decisionModelQuestions";
import { buildDecisionModelStateFields } from "@/src/features/evals/v2/fns/variableMapping/buildDecisionModelStateFields";
import { variableFieldsForTarget } from "@/src/features/evals/v2/fns/rules/traceTranscriptAssignments";
import { buildEvaluatorVariableMappings } from "@/src/features/evals/v2/fns/variableMapping/buildEvaluatorVariableMappings";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import { useEvaluatorTraceSample } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
import { useFallbackDecisionModel } from "@/src/features/evals/v2/hooks/useFallbackDecisionModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

const StableVariableMapping = memo(VariableMapping);

const SOURCE_UNAVAILABLE_MESSAGE =
  "Select a sample observation in the test panel to preview mapped values.";
const TRACE_SOURCE_UNAVAILABLE_MESSAGE =
  "Select a sample trace in the test panel to preview mapped values.";
const TRACE_NO_MESSAGES_MESSAGE =
  "This trace has no messages. Pick another trace in the test panel.";

export function VariableMappingEditorContainer({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const resolvedSample = useEvaluatorSetupSample({ projectId, store });
  const traceSample = useEvaluatorTraceSample({ projectId, store });
  const sourceColumns = useEvalVariableSourceColumns();
  const state = useStore(
    store,
    useShallow((state) => ({
      type: state.type,
      promptMessages: state.promptMessages,
      stateKeys: state.stateKeys,
      questions: state.questions,
      variableFields: state.variableFields,
      selectedModel: state.selectedModel,
      activeMapping: state.activeMapping,
      selectedObservationId: state.selectedObservation?.id ?? null,
      targetObject: state.targetObject,
      actions: state.actions,
    })),
  );
  const mappings = useMemo(() => {
    const variableFields = variableFieldsForTarget(
      state.targetObject,
      state.variableFields,
    );
    return state.type === "DECISION_MODEL"
      ? buildDecisionModelStateFields({
          stateKeys: state.stateKeys,
          variableFields,
        })
      : buildEvaluatorVariableMappings({
          promptMessages: state.promptMessages,
          variableFields,
        });
  }, [
    state.type,
    state.stateKeys,
    state.promptMessages,
    state.variableFields,
    state.targetObject,
  ]);
  const fallbackDecisionModel = useFallbackDecisionModel(
    projectId,
    state.type === "DECISION_MODEL",
  );
  const decisionModel = state.selectedModel ?? fallbackDecisionModel;
  const lastCompletedSample = useRef(resolvedSample);

  if (!state.selectedObservationId) lastCompletedSample.current = null;
  else if (resolvedSample) lastCompletedSample.current = resolvedSample;

  const target =
    state.targetObject === TopicsTargetObject
      ? {
          displayedSample: traceSample.sourceObject,
          sourceUnavailableMessage: traceSample.hasNoMessages
            ? TRACE_NO_MESSAGES_MESSAGE
            : TRACE_SOURCE_UNAVAILABLE_MESSAGE,
          sourceColumns: TRACE_TRANSCRIPT_SOURCE_COLUMNS,
        }
      : {
          displayedSample: resolvedSample ?? lastCompletedSample.current,
          sourceUnavailableMessage: SOURCE_UNAVAILABLE_MESSAGE,
          sourceColumns,
        };

  if (state.type === "DECISION_MODEL") {
    const sentQuestions =
      decisionModel != null && isTextAdapterDecisionModel(decisionModel.model)
        ? previewOpenAIDecisionQuestions(state.questions)
        : undefined;
    return (
      <EvalVariableSourceColumnsProvider value={target.sourceColumns}>
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
          sentQuestions={sentQuestions}
          sourceObject={target.displayedSample}
          hasMatchingObservations={Boolean(target.displayedSample)}
          sourceUnavailableMessage={target.sourceUnavailableMessage}
        />
      </EvalVariableSourceColumnsProvider>
    );
  }

  return (
    <EvalVariableSourceColumnsProvider value={target.sourceColumns}>
      <StableVariableMapping
        mode="editable"
        mappings={mappings}
        activeMapping={state.activeMapping}
        onActiveMappingChange={state.actions.setActiveMapping}
        onChangeField={state.actions.setVariableField}
        sourceObject={target.displayedSample}
        hasMatchingObservations={Boolean(target.displayedSample)}
        sourceUnavailableMessage={target.sourceUnavailableMessage}
      />
    </EvalVariableSourceColumnsProvider>
  );
}
