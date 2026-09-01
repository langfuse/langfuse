import { useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { CodeEvalTemplateFormBody } from "@/src/features/evals/components/code-eval-template-form-body";
import {
  CodeEvaluatorAssistantExperience,
  type CodeEvaluatorAssistantContext,
} from "./CodeEvaluatorAssistantExperience";
import { buildCodeEvalContextSnippet } from "@/src/features/evals/v2/fns/evaluatorTesting/buildCodeEvalContextSnippet";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { CodeEvalValidationResult } from "@/src/features/evals/utils/code-eval-template-validation";

export function CodeEditor({
  projectId,
  store,
  validationResult,
  assistantContext,
  onAssistantSubmit,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  validationResult: CodeEvalValidationResult | null;
  assistantContext: CodeEvaluatorAssistantContext | null;
  onAssistantSubmit: (request: string) => Promise<boolean>;
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
    <CodeEvaluatorAssistantExperience
      context={assistantContext}
      onAssistantSubmit={onAssistantSubmit}
    >
      <CodeEvalTemplateFormBody
        sourceCode={state.sourceCode}
        sourceCodeLanguage={state.sourceCodeLanguage}
        onSourceCodeChange={state.setSourceCode}
        editable
        validationResult={validationResult}
        ctxSample={ctxSample}
      />
    </CodeEvaluatorAssistantExperience>
  );
}
