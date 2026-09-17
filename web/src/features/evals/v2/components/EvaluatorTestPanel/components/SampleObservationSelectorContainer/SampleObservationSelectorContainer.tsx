import { useStore } from "zustand";

import { EvaluatorSampleObservationSelector } from "../../../Evaluators/Testing/components/EvaluatorSampleObservationSelector/EvaluatorSampleObservationSelector";
import type { EvaluatorSetupStore } from "../../../../store/evaluatorSetupStore/evaluatorSetupStore";

export function SampleObservationSelectorContainer({
  store,
  projectId,
  timeRange,
  onOpenTrace,
}: {
  store: EvaluatorSetupStore;
  projectId: string;
  timeRange: Parameters<
    typeof EvaluatorSampleObservationSelector
  >[0]["timeRange"];
  onOpenTrace: Parameters<
    typeof EvaluatorSampleObservationSelector
  >[0]["onOpenTrace"];
}) {
  const selectedObservationId = useStore(
    store,
    (state) => state.selectedObservation?.id ?? null,
  );
  const filterState = useStore(store, (state) => state.sampleFilter);
  const actions = store.getState().actions;

  return (
    <EvaluatorSampleObservationSelector
      projectId={projectId}
      timeRange={timeRange}
      selectedObservationId={selectedObservationId}
      filterState={filterState}
      onFilterStateChange={actions.setSampleFilter}
      onSelect={actions.setSelectedObservation}
      onOpenTrace={onOpenTrace}
    />
  );
}
