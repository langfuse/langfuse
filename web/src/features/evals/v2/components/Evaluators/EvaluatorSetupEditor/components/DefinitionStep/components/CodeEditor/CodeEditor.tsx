import { useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { CodeEvalTemplateFormBody } from "../../../../../../../../components/code-eval-template-form-body";
import { buildCodeEvalContextSnippet } from "../../../../../../../fns/evaluatorTesting/buildCodeEvalContextSnippet";
import { useEvaluatorSetupSample } from "../../../../../../../hooks/useEvaluatorSetupSample";
import type { EvaluatorSetupStore } from "../../../../../../../store/evaluatorSetupStore/evaluatorSetupStore";
import type { CodeEvalValidationResult } from "../../../../../../../../utils/code-eval-template-validation";

export function CodeEditor({
  projectId,
  store,
  validationResult,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  validationResult: CodeEvalValidationResult | null;
}) {
  const sampleObservation = useEvaluatorSetupSample({ projectId, store });
  const state = useStore(
    store,
    useShallow((state) => ({
      sourceCode: state.sourceCode,
      sourceCodeLanguage: state.sourceCodeLanguage,
      setSourceCode: state.actions.setSourceCode,
    })),
  );
  const ctxSample = useMemo(
    () =>
      sampleObservation
        ? buildCodeEvalContextSnippet(
            sampleObservation,
            state.sourceCodeLanguage,
          )
        : null,
    [sampleObservation, state.sourceCodeLanguage],
  );

  return (
    <CodeEvalTemplateFormBody
      sourceCode={state.sourceCode}
      sourceCodeLanguage={state.sourceCodeLanguage}
      onSourceCodeChange={state.setSourceCode}
      editable
      validationResult={validationResult}
      ctxSample={ctxSample}
    />
  );
}
