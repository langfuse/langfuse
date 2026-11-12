import { useStore } from "zustand";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import {
  SampleObservationSelectorBase,
  type SampleObservation,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { resolveSelection } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorSampleObservationSelector/EvaluatorSampleObservationSelector";
import { TraceSampleStepper } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TraceSampleStepper/TraceSampleStepper";
import { TRACE_TRANSCRIPT_SAMPLE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { useEvaluatorTraceSample } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

const NO_LEADING_COLUMNS: Parameters<
  typeof SampleObservationSelectorBase
>[0]["leadingColumns"] = [];

const preserveObservedOptions: Parameters<
  typeof SampleObservationSelectorBase
>[0]["mapObservedOptions"] = (observed) => observed;

/** Trace-scope sample: rule filters, one trace at a time, and its transcript. */
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
      filterTitle="Filter traces"
      filterDescription="A trace matches when one of its observations matches every filter. The rule you save uses these filters."
      filterTooltip="These filters choose the sample traces here and the traces the saved rule evaluates."
      matchingDescription=""
      matchingTooltip=""
      formatCount={(count) => compactNumberFormatter(count)}
      mapObservedOptions={preserveObservedOptions}
      renderMatches={(matches) => (
        <section className="flex flex-col gap-3">
          <TraceSampleStepper
            matches={matches}
            selectedTraceId={selectedObservation?.traceId ?? null}
            onSelect={actions.setSelectedObservation}
            onOpenTrace={onOpenTrace}
          />
          <TraceTranscriptPreview projectId={projectId} store={store} />
        </section>
      )}
    />
  );
}

function TraceTranscriptPreview({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const sample = useEvaluatorTraceSample({ projectId, store, enabled: true });

  if (sample.error) {
    return (
      <Alert variant="destructive" size="sm">
        <Alert.Description>{sample.error}</Alert.Description>
      </Alert>
    );
  }
  if (sample.isPending) return <Skeleton className="h-32 w-full" />;
  if (sample.hasNoTranscript) {
    return (
      <p className="text-muted-foreground text-sm">
        This trace has no transcript to evaluate. Pick another trace.
      </p>
    );
  }
  if (!sample.sourceObject) {
    return (
      <p className="text-muted-foreground text-sm">
        Pick a trace to see its transcript.
      </p>
    );
  }

  return (
    <div className="ph-no-capture flex flex-col gap-2">
      {sample.cutoff ? (
        <Alert variant="warning" size="sm">
          <Alert.Description>
            This transcript is incomplete because the trace exceeds the
            observation limit.
          </Alert.Description>
        </Alert>
      ) : null}
      <JSONView
        title="Transcript"
        json={sample.sourceObject}
        preserveStrings
        collapseDepth={2}
        className="max-h-80 overflow-y-auto"
      />
    </div>
  );
}
