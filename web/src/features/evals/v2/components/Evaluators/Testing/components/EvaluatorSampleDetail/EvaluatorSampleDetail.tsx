import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TopicsTargetObject } from "@langfuse/shared";
import { StringParam, useQueryParam } from "use-query-params";

import { Callout } from "@/src/components/design-system/Callout/Callout";
import { useTraceSampleTranscript } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import type { RuleTargetObject } from "@/src/features/evals/v2/types/rules";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import { TracePresentationProvider } from "@/src/features/traces/contexts/TracePresentationProvider";
import { useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";

const SAMPLE_LIST_KEY = "evaluator-samples";

function SampleHeader({
  title,
  count,
  children,
}: {
  title: string;
  count: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-7 shrink-0 items-center gap-2">
      <h3
        className="min-w-0 truncate text-base font-bold"
        title={count ? `${title} ${count}` : title}
      >
        {title}
        {count ? (
          <span className="text-muted-foreground text-sm font-normal">
            {" "}
            {count}
          </span>
        ) : null}
      </h3>
      {children}
    </div>
  );
}

const SAMPLE_CARD_CLASS_NAME =
  "bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border";

/** One sample in the trace view, under a title row with the match count and prev/next arrows. */
export function EvaluatorSampleDetail({
  projectId,
  targetObject,
  title,
  count,
  total,
  observations,
  selectedObservationId,
  pending,
  onSelect,
}: {
  projectId: string;
  targetObject: RuleTargetObject;
  title: string;
  count: string | null;
  /** All matches, loaded or not. */
  total: string | null;
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

  const selectedTraceId = selected ? (selected.traceId ?? selected.id) : null;
  const selectableObservationIds = useMemo(
    () =>
      new Set(
        observations
          .filter(
            (observation) =>
              (observation.traceId ?? observation.id) === selectedTraceId,
          )
          .map((observation) => observation.id),
      ),
    [observations, selectedTraceId],
  );
  const selectObservation = useCallback(
    (observationId: string) => {
      const next = observations.find(
        (observation) => observation.id === observationId,
      );
      if (next) onSelect(next);
    },
    [observations, onSelect],
  );
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
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <SampleHeader title={title} count={count}>
          {null}
        </SampleHeader>
        <div className={SAMPLE_CARD_CLASS_NAME}>
          <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center p-6 text-sm">
            {pending ? "Loading samples…" : "No samples in this time range."}
          </div>
        </div>
      </div>
    );
  }

  const sampleTraceId = selected.traceId ?? selected.id;
  const view = isTraceTarget
    ? ({
        presentation: "messages",
        observationId: null,
      } as const)
    : ({
        presentation: "observation",
        observationId: selected.id,
      } as const);
  const viewIntent = `${view.presentation}:${view.observationId ?? sampleTraceId}`;
  const showNoMessages =
    isTraceTarget &&
    transcript.hasNoMessages &&
    dismissedNoMessagesFor !== sampleTraceId;
  const startTime = buildLocalIsoDatePresentation({
    date: new Date(selected.startTime),
  });
  const sampleNavigation = (
    <SampleHeader title={title} count={count}>
      {/* In a tight row the trace name gives way before the title. */}
      <span
        className="ph-no-capture text-muted-foreground ml-auto max-w-48 min-w-0 shrink-100 truncate text-sm"
        title={traceName}
      >
        {traceName}
      </span>
      <span
        className="text-muted-foreground font-mono text-xs whitespace-nowrap"
        title={startTime?.title}
      >
        {startTime?.display}
      </span>
      {observations.length > 1 ? (
        <DetailPageNav
          currentId={selected.id}
          listKey={SAMPLE_LIST_KEY}
          orientation="horizontal"
          compact
          showPosition
          positionTotal={total ?? undefined}
          path={() => ""}
          onNavigate={(entry) => {
            const next = observations.find(
              (observation) => observation.id === entry.id,
            );
            if (next) onSelect(next);
          }}
        />
      ) : null}
    </SampleHeader>
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      ref={(element) => {
        if (!element || intentRef.current === viewIntent) return;
        intentRef.current = viewIntent;
        setObservation(view.observationId ?? undefined, "replaceIn");
      }}
    >
      {sampleNavigation}
      <div className={SAMPLE_CARD_CLASS_NAME}>
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
            selectableObservationIds={
              isTraceTarget ? null : selectableObservationIds
            }
            onSelectObservation={isTraceTarget ? null : selectObservation}
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
    </div>
  );
}
