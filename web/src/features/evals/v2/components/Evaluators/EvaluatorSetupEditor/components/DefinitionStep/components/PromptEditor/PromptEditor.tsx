import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { PromptVariableEditor } from "@/src/features/evals/v2/components/Evaluators/Judges/PromptVariableEditor/PromptVariableEditor";
import { preparePromptEditorState } from "@/src/features/evals/v2/fns/promptEditor/preparePromptEditorState";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { useTranslations } from "next-intl";

export function PromptEditor({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const sampleObject = useEvaluatorSetupSample({ projectId, store });
  const state = useStore(
    store,
    useShallow((state) => ({
      prompt: state.prompt,
      variableFields: state.variableFields,
      promptPreviewEnabled: state.promptPreviewEnabled,
      actions: state.actions,
    })),
  );
  const prepared = preparePromptEditorState({
    prompt: state.prompt,
    variableFields: state.variableFields,
    promptPreviewEnabled: state.promptPreviewEnabled,
    sampleObject,
    columnLabels: {
      input: t("variableMapping.columns.input"),
      output: t("variableMapping.columns.output"),
      metadata: t("variableMapping.columns.metadata"),
      toolCalls: t("variableMapping.columns.toolCalls"),
      experimentItemExpectedOutput: t(
        "variableMapping.columns.experimentItemExpectedOutput",
      ),
      experimentItemMetadata: t(
        "variableMapping.columns.experimentItemMetadata",
      ),
    },
    messages: {
      notMapped: t("variableMapping.prompt.notMapped"),
      emptyMapping: t("variableMapping.prompt.emptyMapping"),
      sampleRequired: t("variableMapping.prompt.sampleRequired"),
      mapVariable: (variable) =>
        t("variableMapping.prompt.mapVariable", { variable }),
      fixVariable: (variable) =>
        t("variableMapping.prompt.fixVariable", { variable }),
    },
  });

  return (
    <PromptVariableEditor
      value={state.prompt}
      onChange={state.actions.setPrompt}
      variableStatus={prepared.promptVariableStatus}
      variableMappings={prepared.promptVariableMappings}
      showPreviewToggle
      previewEnabled={state.promptPreviewEnabled}
      onPreviewEnabledChange={state.actions.setPromptPreviewEnabled}
      previewDisabledReason={prepared.promptPreviewDisabledReason}
      preview={prepared.promptPreview}
    />
  );
}
