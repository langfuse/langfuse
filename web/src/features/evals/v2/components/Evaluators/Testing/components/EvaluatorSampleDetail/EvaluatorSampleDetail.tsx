import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "@langfuse/icons";
import { StringParam, useQueryParam } from "use-query-params";

import { Callout } from "@/src/components/design-system/Callout/Callout";
import { Button } from "@/src/components/ui/button";
import { useTraceSampleTranscript } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import { useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";

const SAMPLE_LIST_KEY = "evaluator-samples";

function sampleViewIntent(
  sampleScope: "observation" | "trace",
  selected: SampleObservation | null,
) {
  if (selected == null) return null;
  if (sampleScope === "trace")
    return `trace:${selected.traceId ?? selected.id}`;
  return `observation:${selected.id}`;
}

/**
 * One trace on screen. Observation scope opens the matched span; trace scope
 * opens Messages. Sample count and prev/next arrows sit above the trace.
 */
export function EvaluatorSampleDetail({
  projectId,
  sampleScope,
  observations,
  selectedObservationId,
  selectedObservation = null,
  pending,
  onSelect,
}: {
  projectId: string;
  sampleScope: "observation" | "trace";
  observations: SampleObservation[];
  selectedObservationId: string | null;
  selectedObservation?: SampleObservation | null;
  pending: boolean;
  onSelect: (observation: SampleObservation | null) => void;
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
  const transcript = useTraceSampleTranscript({
    projectId,
    sample: selected,
    enabled: sampleScope === "trace",
  });
  const [dismissedNoMessagesFor, setDismissedNoMessagesFor] = useState<
    string | null
  >(null);
  const traceName =
    detail.data?.name || selected?.traceName || selected?.name || "Sample";

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
  const sampleTraceId = selected.traceId ?? selected.id;
  const showNoMessages =
    sampleScope === "trace" &&
    transcript.hasNoMessages &&
    dismissedNoMessagesFor !== sampleTraceId;
  const sampleNavigation = (
    <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
      <div className="flex flex-col">
        <span className="text-muted-foreground text-xs">
          {sampleScope === "trace" ? "Sample trace" : "Sample observation"}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {samplePosition} of {observations.length}
        </span>
      </div>
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
      {sampleNavigation}
      {showNoMessages ? (
        <div className="shrink-0 px-3 pt-2">
          <Callout
            variant="warning"
            align="top"
            actions={[]}
            onDismiss={() => setDismissedNoMessagesFor(sampleTraceId)}
          >
            <p>
              This trace has no messages to evaluate. Messages are probably
              missing from your instrumentation. Try another trace.
            </p>
          </Callout>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <TraceDetailBody
          trace={detail.data}
          context="peek"
          presentation={sampleScope === "trace" ? "messages" : "observation"}
          preferredObservationId={
            sampleScope === "observation" ? selected.id : null
          }
          truncatedAtObservations={detail.truncatedAtObservations}
          isPlaceholderData={detail.isPlaceholderData}
          keySuffix={sampleTraceId}
          header={{
            variant: "page",
            headerProps: {
              title: traceName,
              itemType: "TRACE",
            },
          }}
        />
      </div>
    </div>
  );
}
