import { TopicsTargetObject } from "@langfuse/shared";
import { useStore } from "zustand";

import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import { useEvaluatorTraceSample } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

/** The selected sample in the shape the prompt variables read for the test target. */
export function useEvaluatorPromptSample({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const observationSample = useEvaluatorSetupSample({ projectId, store });
  const traceSample = useEvaluatorTraceSample({ projectId, store });
  const isTraceTarget = useStore(
    store,
    (state) => state.targetObject === TopicsTargetObject,
  );
  return isTraceTarget ? traceSample.sourceObject : observationSample;
}
