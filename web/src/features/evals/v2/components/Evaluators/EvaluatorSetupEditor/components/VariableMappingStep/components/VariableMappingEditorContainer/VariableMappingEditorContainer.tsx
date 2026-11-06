import { memo, useMemo, useRef } from "react";
import { isOpenAIDecisionModel } from "@langfuse/shared";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { DecisionModelStateEditor } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelStateEditor/DecisionModelStateEditor";
import { OpenAIDecisionModelStateEditor } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/OpenAIDecisionModelStateEditor/OpenAIDecisionModelStateEditor";
import { VariableMapping } from "@/src/features/evals/v2/components/VariableMapping/VariableMapping";
import { buildDecisionModelStateFields } from "@/src/features/evals/v2/fns/variableMapping/buildDecisionModelStateFields";
import { buildEvaluatorVariableMappings } from "@/src/features/evals/v2/fns/variableMapping/buildEvaluatorVariableMappings";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import { useFallbackDecisionModel } from "@/src/features/evals/v2/hooks/useFallbackDecisionModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

const StableVariableMapping = memo(VariableMapping);

const SOURCE_UNAVAILABLE_MESSAGE =
  "Select a sample observation in the test panel to preview mapped values.";
const TRACE_SOURCE_UNAVAILABLE_MESSAGE = "Select a sample trace.";

export function VariableMappingEditorContainer({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const resolved = useEvaluatorSetupSample({ projectId, store });
  const resolvedSample = resolved.sample;
  const state = useStore(
    store,
    useShallow((state) => ({
      type: state.type,
      sampleScope: state.sampleScope,
      promptMessages: state.promptMessages,
      stateKeys: state.stateKeys,
      questions: state.questions,
      variableFields: state.variableFields,
      selectedModel: state.selectedModel,
      activeMapping: state.activeMapping,
      selectedObservationId: state.selectedObservation?.id ?? null,
      actions: state.actions,
    })),
  );
  const threadsOnly = state.sampleScope === "trace";
  const defaultColumnId = threadsOnly ? "threads" : undefined;
  const unavailableMessage = threadsOnly
    ? (resolved.notice ?? TRACE_SOURCE_UNAVAILABLE_MESSAGE)
    : SOURCE_UNAVAILABLE_MESSAGE;
  const mappings = useMemo(
    () =>
      state.type === "DECISION_MODEL"
        ? buildDecisionModelStateFields({
            stateKeys: state.stateKeys,
            variableFields: state.variableFields,
            defaultColumnId,
          })
        : buildEvaluatorVariableMappings({
            promptMessages: state.promptMessages,
            variableFields: state.variableFields,
            defaultColumnId,
          }),
    [
      defaultColumnId,
      state.type,
      state.stateKeys,
      state.promptMessages,
      state.variableFields,
    ],
  );
  const fallbackDecisionModel = useFallbackDecisionModel(
    projectId,
    state.type === "DECISION_MODEL",
  );
  const decisionModel = state.selectedModel ?? fallbackDecisionModel;
  const lastCompletedSample = useRef(resolvedSample);

  if (!state.selectedObservationId) lastCompletedSample.current = null;
  else if (resolvedSample) lastCompletedSample.current = resolvedSample;
  else if (threadsOnly && resolved.notice) lastCompletedSample.current = null;

  const displayedSample = resolvedSample ?? lastCompletedSample.current;
  const transcriptNotice =
    threadsOnly && resolved.notice && displayedSample ? (
      <p className="text-muted-foreground text-sm">{resolved.notice}</p>
    ) : null;

  if (
    state.type === "DECISION_MODEL" &&
    decisionModel != null &&
    isOpenAIDecisionModel(decisionModel.model)
  ) {
    const inputField = mappings.find((mapping) => mapping.variable === "input");
    return (
      <>
        {transcriptNotice}
        <OpenAIDecisionModelStateEditor
          field={{
            key: "input",
            fieldState: inputField?.fieldState ?? {
              selectedColumnId: threadsOnly ? "threads" : "input",
              jsonSelector: null,
            },
          }}
          activeMapping={state.activeMapping}
          onActiveMappingChange={state.actions.setActiveMapping}
          onChangeField={(fieldState) =>
            state.actions.setVariableField("input", fieldState)
          }
          questions={state.questions}
          sourceObject={displayedSample}
          hasMatchingObservations={Boolean(displayedSample)}
          sourceUnavailableMessage={unavailableMessage}
          threadsOnly={threadsOnly}
        />
      </>
    );
  }

  if (state.type === "DECISION_MODEL") {
    return (
      <>
        {transcriptNotice}
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
          sourceUnavailableMessage={unavailableMessage}
          threadsOnly={threadsOnly}
        />
      </>
    );
  }

  return (
    <>
      {transcriptNotice}
      <StableVariableMapping
        mode="editable"
        mappings={mappings}
        activeMapping={state.activeMapping}
        onActiveMappingChange={state.actions.setActiveMapping}
        onChangeField={state.actions.setVariableField}
        sourceObject={displayedSample}
        hasMatchingObservations={Boolean(displayedSample)}
        sourceUnavailableMessage={unavailableMessage}
        threadsOnly={threadsOnly}
      />
    </>
  );
}
