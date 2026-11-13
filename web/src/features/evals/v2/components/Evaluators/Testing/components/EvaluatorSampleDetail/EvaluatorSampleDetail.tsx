import { useCallback, useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "@langfuse/icons";
import type { FilterState } from "@langfuse/shared";
import { StringParam, useQueryParam } from "use-query-params";

import { Button } from "@/src/components/ui/button";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import {
  filtersFromSpan,
  observationTreeHints,
  spanPropertiesFromObservation,
  type ObservationTreeHint,
  type SpanProperties,
} from "@/src/features/evals/v2/fns/evaluatorTesting/spanSampleFilters";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import { ObservationEvaluationHintsProvider } from "@/src/features/traces/contexts/ObservationEvaluationHintsProvider";
import { useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";

const SAMPLE_LIST_KEY = "evaluator-samples";
const EMPTY_HINTS = new Map<string, ObservationTreeHint>();

function sampleViewIntent(
  sampleScope: "observation" | "trace",
  selected: SampleObservation | null,
) {
  if (selected == null) return null;
  if (sampleScope === "trace")
    return `trace:${selected.traceId ?? selected.id}`;
  return `observation:${selected.id}`;
}

function sampleFromSpan(span: SpanProperties): SampleObservation {
  const startTime =
    span.startTime instanceof Date
      ? span.startTime
      : new Date(span.startTime ?? 0);
  return {
    id: span.id,
    traceId: span.traceId ?? null,
    name: span.name ?? null,
    traceName: span.traceName ?? null,
    type: span.type ?? "SPAN",
    startTime,
    environment: span.environment ?? "default",
  } as SampleObservation;
}

/**
 * One trace on screen. The sample count and left/right arrows sit at the far
 * right of the trace header. Observation scope opens the matched span and
 * marks the other spans the current filters match. Trace scope opens Messages.
 */
export function EvaluatorSampleDetail({
  projectId,
  sampleScope,
  observations,
  selectedObservationId,
  selectedObservation = null,
  filterState,
  pending,
  onSelect,
  onRetarget,
}: {
  projectId: string;
  sampleScope: "observation" | "trace";
  observations: SampleObservation[];
  selectedObservationId: string | null;
  selectedObservation?: SampleObservation | null;
  filterState: FilterState;
  pending: boolean;
  onSelect: (observation: SampleObservation | null) => void;
  onRetarget: (observation: SampleObservation, filters: FilterState) => void;
}) {
  const selectedFromPage =
    observations.find(
      (observation) => observation.id === selectedObservationId,
    ) ?? null;
  const selected =
    selectedFromPage ??
    (selectedObservation?.id === selectedObservationId
      ? selectedObservation
      : null);
  const { setDetailPageList } = useDetailPageLists();
  const entries = useMemo(
    () => observations.map((observation) => ({ id: observation.id })),
    [observations],
  );
  useEffect(() => {
    setDetailPageList(SAMPLE_LIST_KEY, entries);
    return () => setDetailPageList(SAMPLE_LIST_KEY, []);
  }, [entries, setDetailPageList]);

  const [, setObservation] = useQueryParam("observation", StringParam);
  const intentRef = useRef<string | null>(null);
  const viewIntent = sampleViewIntent(sampleScope, selected);

  const detail = useTraceDetailData({
    projectId,
    traceId: selected?.traceId ?? undefined,
    timestamp: selected ? new Date(selected.startTime) : undefined,
    enabled: Boolean(selected?.traceId),
  });
  const traceName =
    detail.data?.name || selected?.traceName || selected?.name || "Sample";
  const hints = useMemo(() => {
    if (sampleScope !== "observation" || selected == null || !detail.data) {
      return EMPTY_HINTS;
    }
    const spans = detail.data.observations.map((observation) =>
      spanPropertiesFromObservation(observation, detail.data),
    );
    return observationTreeHints(spans, filterState, selected.id);
  }, [detail.data, filterState, sampleScope, selected]);
  const onEvaluateInstead = useCallback(
    (observationId: string) => {
      const observation = detail.data?.observations.find(
        (item) => item.id === observationId,
      );
      if (!observation || !detail.data) return;
      const span = spanPropertiesFromObservation(observation, detail.data);
      const sample =
        observations.find((item) => item.id === observationId) ??
        sampleFromSpan(span);
      onRetarget(sample, filtersFromSpan(filterState, span));
    },
    [detail.data, filterState, observations, onRetarget],
  );

  if (!selected) {
    return (
      <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center p-6 text-sm">
        {pending ? "Loading samples…" : "No samples in this time range."}
      </div>
    );
  }

  const selectSample = (observation: SampleObservation) => {
    onSelect(observation);
  };
  const sampleIndex = observations.findIndex(
    (observation) => observation.id === selected.id,
  );
  const samplePosition = sampleIndex >= 0 ? sampleIndex + 1 : 1;
  const sampleControls = (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className="text-sm tabular-nums"
        aria-label={`${samplePosition} of ${observations.length}`}
      >
        {samplePosition}/{observations.length}
      </span>
      {observations.length > 1 ? (
        <DetailPageNav
          currentId={selected.id}
          listKey={SAMPLE_LIST_KEY}
          orientation="horizontal"
          path={() => ""}
          onNavigate={(entry) => {
            const next = observations.find(
              (observation) => observation.id === entry.id,
            );
            if (next) selectSample(next);
          }}
        />
      ) : (
        <div className="flex flex-row gap-1">
          <Button
            type="button"
            variant="outline"
            aria-label="Previous sample"
            disabled
          >
            <ChevronLeft size="base" color="default" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Next sample"
            disabled
          >
            <ChevronRight size="base" color="default" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      ref={(element) => {
        if (
          !element ||
          viewIntent == null ||
          intentRef.current === viewIntent
        ) {
          return;
        }
        intentRef.current = viewIntent;
        setObservation(
          sampleScope === "observation" ? selected.id : undefined,
          "replaceIn",
        );
      }}
    >
      <div className="min-h-0 flex-1">
        <ObservationEvaluationHintsProvider
          hints={hints}
          onEvaluateInstead={onEvaluateInstead}
        >
          <TraceDetailBody
            trace={detail.data}
            context="peek"
            presentation={sampleScope === "trace" ? "messages" : "observation"}
            preferredObservationId={
              sampleScope === "observation" ? selected.id : null
            }
            truncatedAtObservations={detail.truncatedAtObservations}
            isPlaceholderData={detail.isPlaceholderData}
            keySuffix={selected.traceId ?? selected.id}
            header={{
              variant: "page",
              headerProps: {
                title: traceName,
                itemType: "TRACE",
                actions: [
                  {
                    id: "samples",
                    type: "custom",
                    pinned: true,
                    render: () => sampleControls,
                  },
                ],
              },
            }}
          />
        </ObservationEvaluationHintsProvider>
      </div>
    </div>
  );
}
