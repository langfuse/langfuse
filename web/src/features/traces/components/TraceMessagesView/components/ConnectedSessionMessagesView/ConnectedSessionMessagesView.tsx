import { useMemo, useState, type ComponentProps } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { useRouter } from "next/router";
import { ErrorBoundary } from "@sentry/nextjs";
import { api } from "@/src/utils/api";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { traceNodeId } from "@/src/features/traces/fns/treeBuilding";
import { useSessionTraceTranscripts } from "@/src/features/sessions/hooks/useSessionTraceTranscripts";
import { useSessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { getSessionConversationEntries } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionConversationEntries";
import { getSessionTranscriptThreads } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptThreads";

const TRANSCRIPT_CHUNK_SIZE = 20;

export function ConnectedSessionMessagesView({
  projectId,
  sessionId,
  enabled,
}: {
  projectId: string;
  sessionId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const { openDetails } = useSelection();
  const tracesQuery = api.sessions.tracesFromEvents.useQuery(
    { projectId, sessionId },
    { enabled, staleTime: 60 * 1_000 },
  );
  const traces = useMemo(() => tracesQuery.data ?? [], [tracesQuery.data]);
  const [loadedTraceCount, setLoadedTraceCount] = useState(
    TRANSCRIPT_CHUNK_SIZE,
  );
  const [transcriptSource] = useQueryParam("transcriptSource", StringParam);
  const results = useSessionTraceTranscripts({
    projectId,
    traces: traces.map((trace, index) => ({ trace, turnNumber: index + 1 })),
    activeTraceIds: new Set(
      enabled ? traces.slice(0, loadedTraceCount).map((trace) => trace.id) : [],
    ),
    transcriptSource: transcriptSource === "root" ? "root" : "generations",
  });
  const entries = getSessionConversationEntries(
    traces.map((trace) => {
      const result = results.get(trace.id);
      return {
        trace,
        transcript: result?.state === "loaded" ? result.transcript : undefined,
      };
    }),
  );
  const traceIndexById = new Map(
    traces.map((trace, index) => [trace.id, index]),
  );
  const controller = useSessionConversationTimelineController(
    entries.map((entry) => ({
      trace: traces[entry.traceIndex]!,
      itemId: entry.itemId,
    })),
    (visibleTraceIds) => {
      const lastVisibleIndex = visibleTraceIds.reduce(
        (last, id) => Math.max(last, traceIndexById.get(id) ?? -1),
        -1,
      );
      setLoadedTraceCount((current) =>
        Math.max(
          current,
          Math.ceil((lastVisibleIndex + 1) / TRANSCRIPT_CHUNK_SIZE) *
            TRANSCRIPT_CHUNK_SIZE,
        ),
      );
    },
  );
  const openTrace = (
    row: (typeof traces)[number],
    observationId: string | undefined,
  ) => {
    const { traceView, observation, traceTab, ...query } = router.query;
    // Opening mobile details also writes URL state, so wait for the new route.
    void router
      .replace(
        {
          pathname: router.pathname,
          query: {
            ...query,
            aggregation: "session",
            traceId: row.id,
            timestamp: row.timestamp.toISOString(),
            observation: observationId ?? traceNodeId(row.id),
          },
        },
        undefined,
        { shallow: true },
      )
      .then(() => openDetails());
  };

  const timelineTraces: ComponentProps<
    typeof SessionConversationTimeline
  >["traces"] = entries.map((entry) => {
    const trace = traces[entry.traceIndex]!;
    const result = results.get(trace.id);
    const state = (() => {
      if (!result || result.state === "loading")
        return { type: "loading" as const };
      if (result.state === "error") return { type: "error" as const };
      const { visibleThreads, hiddenThreadCount } = getSessionTranscriptThreads(
        result.transcript,
      );
      if (visibleThreads.length === 0 && hiddenThreadCount === 0)
        return { type: "empty" as const };
      return { type: "transcript" as const, result };
    })();
    return {
      ...entry,
      trace,
      turnNumber: entry.traceIndex + 1,
      variant: "embedded-session",
      state,
      scrollTarget: null,
      onOpenTrace: () => openTrace(trace, undefined),
      onOpenObservation: (id) => openTrace(trace, id),
    };
  });

  if (tracesQuery.isError) {
    return (
      <div role="alert" className="p-3 text-sm">
        Could not load session messages.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => void tracesQuery.refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!tracesQuery.data)
    return (
      <div role="status" className="text-muted-foreground p-3 text-sm">
        Loading session messages…
      </div>
    );
  if (!traces.length)
    return (
      <div className="text-muted-foreground p-3 text-sm">
        This session has no messages.
      </div>
    );
  return (
    <ErrorBoundary
      key={sessionId}
      fallback={
        <div className="text-muted-foreground p-3 text-sm">
          Unprocessable content.
        </div>
      }
    >
      <SessionConversationTimeline
        traces={timelineTraces}
        controller={controller}
      />
    </ErrorBoundary>
  );
}
