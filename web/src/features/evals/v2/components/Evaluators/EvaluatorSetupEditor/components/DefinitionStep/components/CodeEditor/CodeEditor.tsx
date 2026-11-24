import { useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { TopicsTargetObject } from "@langfuse/shared";

import { CodeEvalTemplateFormBody } from "@/src/features/evals/components/CodeEvalTemplateFormBody";
import { buildCodeEvalContextSnippet } from "@/src/features/evals/v2/fns/evaluatorTesting/buildCodeEvalContextSnippet";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { CodeEvalValidationResult } from "@/src/features/evals/utils/code-eval-template-validation";

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
      isTraceTarget: state.targetObject === TopicsTargetObject,
    })),
  );
  // The snippet shows an observation context, which a trace target never receives.
  const ctxSample = useMemo(
    () =>
      sampleObservation && !state.isTraceTarget
        ? buildCodeEvalContextSnippet(
            sampleObservation,
            state.sourceCodeLanguage,
          )
        : null,
    [sampleObservation, state.sourceCodeLanguage, state.isTraceTarget],
  );

  return (
    <CodeEvalTemplateFormBody
      projectId={projectId}
      sourceCode={state.sourceCode}
      sourceCodeLanguage={state.sourceCodeLanguage}
      onSourceCodeChange={state.setSourceCode}
      editable
      validationResult={validationResult}
      ctxSample={ctxSample}
    />
  );
}
