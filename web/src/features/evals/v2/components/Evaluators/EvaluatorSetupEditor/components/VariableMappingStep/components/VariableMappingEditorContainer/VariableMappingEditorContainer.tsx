import { memo, useMemo, useRef, type ReactNode } from "react";
import {
  isOpenAIDecisionModel,
  TRACE_TRANSCRIPT_EVAL_COLUMN,
} from "@langfuse/shared";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { DecisionModelStateEditor } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelStateEditor/DecisionModelStateEditor";
import { OpenAIDecisionModelStateEditor } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/OpenAIDecisionModelStateEditor/OpenAIDecisionModelStateEditor";
import { VariableMapping } from "@/src/features/evals/v2/components/VariableMapping/VariableMapping";
import {
  EvalVariableSourceColumnsProvider,
  TRACE_TRANSCRIPT_SOURCE_COLUMNS,
} from "@/src/features/evals/v2/contexts/EvalVariableSourceColumnsProvider";
import { buildDecisionModelStateFields } from "@/src/features/evals/v2/fns/variableMapping/buildDecisionModelStateFields";
import { buildEvaluatorVariableMappings } from "@/src/features/evals/v2/fns/variableMapping/buildEvaluatorVariableMappings";
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
      promptMessages: state.promptMessages,
      stateKeys: state.stateKeys,
      questions: state.questions,
      variableFields: state.variableFields,
      traceVariableFields: state.traceVariableFields,
      selectedModel: state.selectedModel,
      activeMapping: state.activeMapping,
      selectedObservationId: state.selectedObservation?.id ?? null,
      actions: state.actions,
    })),
  );
  const mappings = useMemo(() => {
    const observationMappings =
      state.type === "DECISION_MODEL"
        ? buildDecisionModelStateFields({
            stateKeys: state.stateKeys,
            variableFields: state.variableFields,
          })
        : buildEvaluatorVariableMappings({
            promptMessages: state.promptMessages,
            variableFields: state.variableFields,
          });
    if (scope !== "trace") return observationMappings;
    return observationMappings.map(({ variable }) => ({
      variable,
      fieldState: {
        selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
        jsonSelector: state.traceVariableFields[variable]?.jsonSelector ?? null,
      },
    }));
  }, [
    scope,
    state.type,
    state.stateKeys,
    state.promptMessages,
    state.variableFields,
    state.traceVariableFields,
  ]);
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
      ? traceSourceUnavailableMessage(traceSample.hasNoTranscript)
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

  if (
    state.type === "DECISION_MODEL" &&
    decisionModel != null &&
    isOpenAIDecisionModel(decisionModel.model)
  ) {
    const inputField = mappings.find((mapping) => mapping.variable === "input");
    return withSourceColumns(
      <OpenAIDecisionModelStateEditor
        field={{
          key: "input",
          fieldState: inputField?.fieldState ?? {
            selectedColumnId:
              scope === "trace" ? TRACE_TRANSCRIPT_EVAL_COLUMN : "input",
            jsonSelector: null,
          },
        }}
        activeMapping={state.activeMapping}
        onActiveMappingChange={state.actions.setActiveMapping}
        onChangeField={(fieldState) => setField("input", fieldState)}
        questions={state.questions}
        sourceObject={displayedSample}
        hasMatchingObservations={Boolean(displayedSample)}
        sourceUnavailableMessage={sourceUnavailableMessage}
      />,
    );
  }

  if (state.type === "DECISION_MODEL") {
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

function traceSourceUnavailableMessage(hasNoTranscript: boolean) {
  return hasNoTranscript
    ? "This trace has no transcript. Pick another trace in the test panel."
    : TRACE_SOURCE_UNAVAILABLE_MESSAGE;
}
