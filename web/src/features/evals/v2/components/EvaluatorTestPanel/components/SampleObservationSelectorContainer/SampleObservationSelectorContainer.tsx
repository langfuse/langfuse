import { useStore } from "zustand";
import type { FilterState } from "@langfuse/shared";

import useLocalStorage from "@/src/components/useLocalStorage";
import { EVALUATOR_FILTER_EXPERIENCE_STORAGE_KEY } from "@/src/features/evals/v2/constants/evaluatorFilterExperience";
import { useEvalOnboardingAnalytics } from "@/src/features/evals/v2/contexts/EvalOnboardingAnalyticsContext";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import { EvaluatorSampleObservationSelector } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorSampleObservationSelector/EvaluatorSampleObservationSelector";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

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
  const onboardingAnalytics = useEvalOnboardingAnalytics();
  const [filterExperience] = useLocalStorage<EvaluatorFilterExperience>(
    EVALUATOR_FILTER_EXPERIENCE_STORAGE_KEY,
    "query",
  );
  const changeFilterState = (nextFilterState: FilterState) => {
    // The search bar can re-commit an unchanged filter; only a real change is
    // a step.
    const hasChanged =
      JSON.stringify(nextFilterState) !==
      JSON.stringify(store.getState().sampleFilter);
    actions.setSampleFilter(nextFilterState);
    if (hasChanged) {
      onboardingAnalytics?.completeStep({
        stepName: "evaluator_filter_changed",
        filterExperience,
        filterCount: nextFilterState.length,
      });
    }
  };

  return (
    <EvaluatorSampleObservationSelector
      projectId={projectId}
      timeRange={timeRange}
      selectedObservationId={selectedObservationId}
      filterState={filterState}
      onFilterStateChange={changeFilterState}
      onSelect={actions.setSelectedObservation}
      onOpenTrace={onOpenTrace}
    />
  );
}
