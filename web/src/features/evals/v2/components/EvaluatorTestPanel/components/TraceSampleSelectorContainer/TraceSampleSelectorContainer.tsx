import { TopicsTargetObject } from "@langfuse/shared";
import { useStore } from "zustand";

import type { AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import {
  SampleObservationSelectorBase,
  type SampleObservation,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { resolveSelection } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorSampleObservationSelector/EvaluatorSampleObservationSelector";
import { TRACE_TRANSCRIPT_SAMPLE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { TRACE_FILTER_TOOLTIP } from "@/src/features/evals/v2/constants/ruleScopeCopy";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

const NO_LEADING_COLUMNS: Parameters<
  typeof SampleObservationSelectorBase
>[0]["leadingColumns"] = [];

const preserveObservedOptions: Parameters<
  typeof SampleObservationSelectorBase
>[0]["mapObservedOptions"] = (observed) => observed;

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
  const selectedObservationId = useStore(
    store,
    (state) => state.selectedObservation?.id ?? null,
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
      selectedObservationId={selectedObservationId}
      onSelect={actions.setSelectedObservation}
      onOpenTrace={onOpenTrace}
      leadingColumns={NO_LEADING_COLUMNS}
      resolveSelection={resolveSelection}
      getRowClassName={undefined}
      filterDescription="A trace matches if at least one of its observations matches all filters. The rule you save uses these filters."
      filterTooltip={TRACE_FILTER_TOOLTIP}
      matchingDescription=""
      matchingTooltip=""
      formatCount={(count) => compactNumberFormatter(count)}
      mapObservedOptions={preserveObservedOptions}
      samplePresentation="detail"
      targetObject={TopicsTargetObject}
    />
  );
}
