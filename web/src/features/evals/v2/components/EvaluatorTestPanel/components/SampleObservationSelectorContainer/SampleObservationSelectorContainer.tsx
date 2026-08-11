import { useStore } from "zustand";

import { SampleObservationSelector } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelector/SampleObservationSelector";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function SampleObservationSelectorContainer({
  store,
  projectId,
  timeRange,
  onOpenTrace,
}: {
  store: EvaluatorSetupStore;
  projectId: string;
  timeRange: Parameters<typeof SampleObservationSelector>[0]["timeRange"];
  onOpenTrace: Parameters<typeof SampleObservationSelector>[0]["onOpenTrace"];
}) {
  const selectedObservationId = useStore(
    store,
    (state) => state.selectedObservation?.id ?? null,
  );
  const actions = store.getState().actions;

  return (
    <SampleObservationSelector
      projectId={projectId}
      timeRange={timeRange}
      selectedObservationId={selectedObservationId}
      onSelect={actions.setSelectedObservation}
      onOpenTrace={onOpenTrace}
    />
  );
}
