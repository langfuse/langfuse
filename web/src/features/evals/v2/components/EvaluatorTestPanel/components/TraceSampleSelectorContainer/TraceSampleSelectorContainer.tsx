import { useStore } from "zustand";

import type { AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import {
  SampleObservationSelectorBase,
  type SampleObservation,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { resolveSelection } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorSampleObservationSelector/EvaluatorSampleObservationSelector";
import { EvaluatorSampleDetail } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorSampleDetail/EvaluatorSampleDetail";
import { TRACE_TRANSCRIPT_SAMPLE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

const NO_LEADING_COLUMNS: Parameters<
  typeof SampleObservationSelectorBase
>[0]["leadingColumns"] = [];

const preserveObservedOptions: Parameters<
  typeof SampleObservationSelectorBase
>[0]["mapObservedOptions"] = (observed) => observed;

/** First matching observation per trace, in match order. */
function matchingTraces(observations: SampleObservation[]) {
  const seen = new Set<string>();
  return observations.filter((observation) => {
    if (!observation.traceId || seen.has(observation.traceId)) return false;
    seen.add(observation.traceId);
    return true;
  });
}

/** Trace-scope sample: rule filters and one matching trace at a time. */
export function TraceSampleSelectorContainer({
  store,
  projectId,
  timeRange,
  onOpenTrace,
}: {
  store: EvaluatorSetupStore;
  projectId: string;
  timeRange: AbsoluteTimeRange | null;
  onOpenTrace: (observation: SampleObservation) => void;
}) {
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  const filterState = useStore(store, (state) => state.traceSampleFilter);
  const actions = store.getState().actions;

  return (
    <SampleObservationSelectorBase
      projectId={projectId}
      timeRange={timeRange}
      filterState={filterState}
      onFilterStateChange={actions.setTraceSampleFilter}
      previewFilters={filterState}
      tableName="evaluator-sample-traces"
      registry={TRACE_TRANSCRIPT_SAMPLE_FIELD_REGISTRY}
      selectedObservationId={selectedObservation?.id ?? null}
      onSelect={actions.setSelectedObservation}
      onOpenTrace={onOpenTrace}
      leadingColumns={NO_LEADING_COLUMNS}
      resolveSelection={resolveSelection}
      getRowClassName={undefined}
      filterDescription="A trace matches when one of its observations matches every filter. The rule you save uses these filters."
      filterTooltip="These filters choose the sample traces here and the traces the saved rule evaluates."
      matchingDescription=""
      matchingTooltip=""
      formatCount={(count) => compactNumberFormatter(count)}
      mapObservedOptions={preserveObservedOptions}
      samplePresentation="detail"
      renderMatches={(matches) => (
        <EvaluatorSampleDetail
          projectId={projectId}
          observations={matchingTraces(matches.observations)}
          selectedObservationId={selectedObservation?.id ?? null}
          selectedObservation={selectedObservation}
          pending={matches.pending}
          onSelect={actions.setSelectedObservation}
        />
      )}
    />
  );
}
