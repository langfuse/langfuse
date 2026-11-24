import { memo, useMemo, useRef, type ReactNode } from "react";
import { isTextAdapterDecisionModel } from "@langfuse/shared";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { DecisionModelStateEditor } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelStateEditor/DecisionModelStateEditor";
import { VariableMapping } from "@/src/features/evals/v2/components/VariableMapping/VariableMapping";
import {
  EvalVariableSourceColumnsProvider,
  TRACE_TRANSCRIPT_SOURCE_COLUMNS,
} from "@/src/features/evals/v2/contexts/EvalVariableSourceColumnsProvider";
import { previewOpenAIDecisionQuestions } from "@/src/features/evals/v2/fns/evaluators/decisionModelQuestions";
import { prepareDraftForScope } from "@/src/features/evals/v2/fns/evaluators/prepareDraftForScope";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import { useEvaluatorTraceSample } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
import { useFallbackDecisionModel } from "@/src/features/evals/v2/hooks/useFallbackDecisionModel";
import {
  selectSampleScope,
  type EvaluatorSetupStore,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

const StableVariableMapping = memo(VariableMapping);

const SOURCE_UNAVAILABLE_MESSAGE =
  "Select a sample observation in the test panel to preview mapped values.";
const TRACE_SOURCE_UNAVAILABLE_MESSAGE =
  "Select a sample trace in the test panel to preview mapped values.";

export function VariableMappingEditorContainer({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const resolvedSample = useEvaluatorSetupSample({ projectId, store });
  const scope = useStore(store, selectSampleScope);
  const traceSample = useEvaluatorTraceSample({
    projectId,
    store,
    enabled: scope === "trace",
  });
  const state = useStore(
    store,
    useShallow((state) => ({
      type: state.type,
      questions: state.questions,
      selectedModel: state.selectedModel,
      activeMapping: state.activeMapping,
      selectedObservationId: state.selectedObservation?.id ?? null,
      actions: state.actions,
    })),
  );
  const draftState = useStore(
    store,
    useShallow((state) => ({
      initialDefinition: state.initialDefinition,
      type: state.type,
      name: state.name,
      promptMessages: state.promptMessages,
      questions: state.questions,
      stateKeys: state.stateKeys,
      sourceCode: state.sourceCode,
      sourceCodeLanguage: state.sourceCodeLanguage,
      scoreOutput: state.scoreOutput,
      variableFields: state.variableFields,
      modelMode: state.modelMode,
      selectedModel: state.selectedModel,
      modelParams: state.modelParams,
      sampleScope: state.sampleScope,
      traceVariableFields: state.traceVariableFields,
    })),
  );
  const { mappings } = useMemo(
    () => prepareDraftForScope(draftState),
    [draftState],
  );
  const setField =
    scope === "trace"
      ? state.actions.setTraceVariableField
      : state.actions.setVariableField;
  const fallbackDecisionModel = useFallbackDecisionModel(
    projectId,
    state.type === "DECISION_MODEL",
  );
  const decisionModel = state.selectedModel ?? fallbackDecisionModel;
  const lastCompletedSample = useRef(resolvedSample);

  if (!state.selectedObservationId) lastCompletedSample.current = null;
  else if (resolvedSample) lastCompletedSample.current = resolvedSample;

  const displayedSample =
    scope === "trace"
      ? traceSample.sourceObject
      : (resolvedSample ?? lastCompletedSample.current);
  const sourceUnavailableMessage =
    scope === "trace"
      ? traceSourceUnavailableMessage(traceSample.hasNoMessages)
      : SOURCE_UNAVAILABLE_MESSAGE;
  const withSourceColumns = (editor: ReactNode) =>
    scope === "trace" ? (
      <EvalVariableSourceColumnsProvider
        value={TRACE_TRANSCRIPT_SOURCE_COLUMNS}
      >
        {editor}
      </EvalVariableSourceColumnsProvider>
    ) : (
      editor
    );

  if (state.type === "DECISION_MODEL") {
    const sentQuestions =
      decisionModel != null && isTextAdapterDecisionModel(decisionModel.model)
        ? previewOpenAIDecisionQuestions(state.questions)
        : undefined;
    return withSourceColumns(
      <DecisionModelStateEditor
        fields={mappings.map(({ variable, fieldState }) => ({
          key: variable,
          fieldState,
        }))}
        activeMapping={state.activeMapping}
        onActiveMappingChange={state.actions.setActiveMapping}
        onChangeField={setField}
        onAddField={state.actions.addStateKey}
        onRenameField={state.actions.renameStateKey}
        onRemoveField={state.actions.removeStateKey}
        sentQuestions={sentQuestions}
        sourceObject={displayedSample}
        hasMatchingObservations={Boolean(displayedSample)}
        sourceUnavailableMessage={sourceUnavailableMessage}
      />,
    );
  }

  return withSourceColumns(
    <StableVariableMapping
      mode="editable"
      mappings={mappings}
      activeMapping={state.activeMapping}
      onActiveMappingChange={state.actions.setActiveMapping}
      onChangeField={setField}
      sourceObject={displayedSample}
      hasMatchingObservations={Boolean(displayedSample)}
      sourceUnavailableMessage={sourceUnavailableMessage}
    />,
  );
}

function traceSourceUnavailableMessage(hasNoMessages: boolean) {
  return hasNoMessages
    ? "This trace has no messages. Pick another trace in the test panel."
    : TRACE_SOURCE_UNAVAILABLE_MESSAGE;
}
