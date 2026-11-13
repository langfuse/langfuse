import { useStore } from "zustand";

import { TestRunButton } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestRunButton/TestRunButton";
import { useEvaluatorTestAvailability } from "@/src/features/evals/v2/hooks/useEvaluatorTestAvailability";
import {
  selectSampleScope,
  type EvaluatorSampleScope,
  type EvaluatorSetupStore,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function TestRunCard({
  projectId,
  store,
  hasValidModel,
  onRunTest,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  hasValidModel: boolean;
  onRunTest: () => void;
}) {
  const scope = useStore(store, selectSampleScope);
  const selectedSampleLabel = useStore(store, (state) => {
    const observation = state.selectedObservation;
    if (!observation) return null;
    return selectSampleScope(state) === "trace"
      ? (observation.traceName ?? observation.traceId ?? observation.id)
      : (observation.name ?? observation.traceName ?? observation.id);
  });
  const disabledReason = useEvaluatorTestAvailability({
    projectId,
    store,
    hasValidModel,
  });

  return (
    <div className="bg-card text-card-foreground flex min-h-40 flex-col items-center justify-center gap-3 rounded-md border p-6 text-center">
      <TestRunButton
        isPending={false}
        disabledReason={disabledReason}
        onRun={onRunTest}
      />
      <p className="text-muted-foreground text-sm">
        {sampleHint(scope, selectedSampleLabel)}
      </p>
    </div>
  );
}

function sampleHint(scope: EvaluatorSampleScope, label: string | null) {
  if (scope === "trace") {
    return label
      ? `Sample trace: ${label}. Use the arrows above to change it.`
      : "Pick a trace above to use it as the test sample.";
  }
  return label
    ? `Sample: ${label}. Select a different row above to change it.`
    : "Select an observation above to use it as the test sample.";
}
