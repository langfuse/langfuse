import { useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  TopicsTargetObject,
  TRACE_TRANSCRIPT_EVAL_COLUMN,
} from "@langfuse/shared";

import { CodeEvalTemplateFormBody } from "@/src/features/evals/components/CodeEvalTemplateFormBody";
import { buildCodeEvalContextSnippet } from "@/src/features/evals/v2/fns/evaluatorTesting/buildCodeEvalContextSnippet";
import { buildTraceCodeEvalContextSnippet } from "@/src/features/evals/v2/fns/evaluatorTesting/buildTraceCodeEvalContextSnippet";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import { useEvaluatorTraceSample } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
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
  const traceSample = useEvaluatorTraceSample({ projectId, store });
  const state = useStore(
    store,
    useShallow((state) => ({
      sourceCode: state.sourceCode,
      sourceCodeLanguage: state.sourceCodeLanguage,
      setSourceCode: state.actions.setSourceCode,
      isTraceTarget: state.targetObject === TopicsTargetObject,
    })),
  );
  // The ctx hover shows what evaluate() receives for the selected sample:
  // the trace's threads on a trace target, otherwise the observation.
  const ctxSample = useMemo(() => {
    if (state.isTraceTarget) {
      return traceSample.sourceObject
        ? buildTraceCodeEvalContextSnippet(
            traceSample.sourceObject[TRACE_TRANSCRIPT_EVAL_COLUMN],
            state.sourceCodeLanguage,
          )
        : null;
    }
    return sampleObservation
      ? buildCodeEvalContextSnippet(sampleObservation, state.sourceCodeLanguage)
      : null;
  }, [
    sampleObservation,
    traceSample.sourceObject,
    state.sourceCodeLanguage,
    state.isTraceTarget,
  ]);

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
