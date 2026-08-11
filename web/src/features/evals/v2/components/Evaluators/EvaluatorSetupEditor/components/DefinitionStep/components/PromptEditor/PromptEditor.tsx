import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { PromptVariableEditor } from "@/src/features/evals/v2/components/Evaluators/Judges/PromptVariableEditor/PromptVariableEditor";
import { preparePromptEditorState } from "@/src/features/evals/v2/fns/preparePromptEditorState";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function PromptEditor({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
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
