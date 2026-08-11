import { useStore } from "zustand";

import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelector/SampleObservationSelector";
import { TestResultTraceActions } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultTraceActions/TestResultTraceActions";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function TestResultActions({
  store,
  executionTraceId,
  onOpenSampleTrace,
  onOpenExecutionTrace,
}: {
  store: EvaluatorSetupStore;
  executionTraceId: string | null;
  onOpenSampleTrace: (observation: SampleObservation) => void;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  const openSampleTrace = selectedObservation?.traceId
    ? () => onOpenSampleTrace(selectedObservation)
    : null;

  return openSampleTrace || executionTraceId ? (
    <TestResultTraceActions
      onOpenSampleTrace={openSampleTrace}
      executionTraceId={executionTraceId}
      onOpenExecutionTrace={onOpenExecutionTrace}
    />
  ) : null;
}
