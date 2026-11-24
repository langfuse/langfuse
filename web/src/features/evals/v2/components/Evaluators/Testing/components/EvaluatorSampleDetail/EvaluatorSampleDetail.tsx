import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "@langfuse/icons";
import { TopicsTargetObject } from "@langfuse/shared";
import { StringParam, useQueryParam } from "use-query-params";

import { Callout } from "@/src/components/design-system/Callout/Callout";
import { Button } from "@/src/components/ui/button";
import { useTraceSampleTranscript } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import type { RuleTargetObject } from "@/src/features/evals/v2/types/rules";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import { TracePresentationProvider } from "@/src/features/traces/contexts/TracePresentationProvider";
import { useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";

const SAMPLE_LIST_KEY = "evaluator-samples";

/** One sample in the trace view, with its count and prev/next arrows above it. */
export function EvaluatorSampleDetail({
  projectId,
  targetObject,
  observations,
  selectedObservationId,
  pending,
  onSelect,
}: {
  projectId: string;
  targetObject: RuleTargetObject;
  observations: SampleObservation[];
  selectedObservationId: string | null;
  pending: boolean;
  onSelect: (observation: SampleObservation | null) => void;
}) {
  const sampleIndex = observations.findIndex(
    (observation) => observation.id === selectedObservationId,
  );
  const selected = observations[sampleIndex] ?? null;
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
  const isTraceTarget = targetObject === TopicsTargetObject;

  const detail = useTraceDetailData({
    projectId,
    traceId: selected?.traceId ?? undefined,
    timestamp: selected ? new Date(selected.startTime) : undefined,
    enabled: Boolean(selected?.traceId),
  });
  const transcript = useTraceSampleTranscript({
    projectId,
    sample: selected,
    enabled: isTraceTarget,
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

  const sampleTraceId = selected.traceId ?? selected.id;
  const view = isTraceTarget
    ? ({
        label: "Sample trace",
        presentation: "messages",
        observationId: null,
      } as const)
    : ({
        label: "Sample observation",
        presentation: "observation",
        observationId: selected.id,
      } as const);
  const viewIntent = `${view.presentation}:${view.observationId ?? sampleTraceId}`;
  const showNoMessages =
    isTraceTarget &&
    transcript.hasNoMessages &&
    dismissedNoMessagesFor !== sampleTraceId;
  const sampleNavigation = (
    <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
      <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        <span
          className="text-muted-foreground truncate text-xs"
          title={view.label}
        >
          {view.label}
        </span>
        <span aria-hidden className="text-muted-foreground text-xs">
          ·
        </span>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {sampleIndex + 1} of {observations.length}
        </span>
      </div>
      <div className="shrink-0">
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
              if (next) onSelect(next);
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
    </div>
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      ref={(element) => {
        if (!element || intentRef.current === viewIntent) return;
        intentRef.current = viewIntent;
        setObservation(view.observationId ?? undefined, "replaceIn");
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
        <TracePresentationProvider
          presentation={view.presentation}
          preferredObservationId={view.observationId}
        >
          <TraceDetailBody
            trace={detail.data}
            context="peek"
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
        </TracePresentationProvider>
      </div>
    </div>
  );
}
