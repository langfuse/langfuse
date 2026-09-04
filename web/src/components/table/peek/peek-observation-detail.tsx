import {
  TablePeekView,
  shouldClosePeekAfterDelete,
} from "@/src/components/table/peek";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import {
  TraceAggregationToggle,
  TraceDetailActions,
  TraceDetailBody,
} from "@/src/features/traces";
import { useTraceDetailMode } from "@/src/features/traces/hooks/useTraceDetailMode";
import { resolvePeekTraceParams } from "@/src/components/table/peek/resolvePeekTraceParams";
import { buildTracePath } from "@langfuse/shared";
import { useRouter } from "next/router";
import { useRef } from "react";

export const TablePeekViewObservationDetail = (
  props: Omit<
    React.ComponentProps<typeof TablePeekView>,
    "children" | "title"
  > & {
    projectId: string;
  },
) => {
  const router = useRouter();
  const { projectId } = props;
  const peekObservationId = router.query.peek as string | undefined;
  const { traceId, timestamp } = resolvePeekTraceParams({
    reader: "observation",
    peek: peekObservationId,
    traceId: router.query.traceId as string | undefined,
    timestamp: router.query.timestamp,
  });

  // Live handle on the peeked observation's trace id: an in-flight delete that
  // resolves after K/J-navigation reads the CURRENT trace here, so it only
  // closes the peek when it still shows the trace that was deleted (LFE-10535).
  const traceIdRef = useRef(traceId);
  traceIdRef.current = traceId;

  const trace = usePeekData({
    projectId,
    traceId,
    timestamp,
    aggregationLevel:
      router.query.aggregation === "session" ? "session" : "trace",
    readPath: props.isV4 ? "v4" : "v3",
  });
  const {
    mode: aggregationLevel,
    selectedObservation,
    setMode: setAggregationLevel,
    title,
    widthMode,
  } = useTraceDetailMode({
    trace: trace.data,
    fallbackFromUnavailableSession: trace.isSessionScopeUnavailable,
  });

  const isSessionScope =
    !!trace.data &&
    "sessionTraceEntries" in trace.data &&
    !!trace.data.sessionTraceEntries;

  const actionProps = trace.data
    ? {
        traceId: trace.data.id,
        projectId: trace.data.projectId,
        isPublic: trace.data.public,
        shareUrl: buildTracePath({
          projectId: trace.data.projectId,
          traceId: trace.data.id,
          observationId:
            typeof router.query.traceId === "string"
              ? peekObservationId
              : undefined,
          timestamp:
            typeof router.query.traceId === "string" ? undefined : timestamp,
        }),
        name: trace.data.name,
        timestamp,
        onAfterDelete: (deletedTraceId: string) => {
          if (shouldClosePeekAfterDelete(traceIdRef.current, deletedTraceId)) {
            props.closePeek();
          }
        },
      }
    : null;
  const aggregationToggle = props.isV4 ? (
    <TraceAggregationToggle
      aggregationLevel={aggregationLevel}
      canSelectSession={trace.canAggregateBySession}
      observationType={selectedObservation?.type ?? null}
      onAggregationLevelChange={setAggregationLevel}
    />
  ) : undefined;

  return (
    <TablePeekView
      {...props}
      itemType={isSessionScope ? "SESSION" : props.itemType}
      title={title}
      {...(props.isV4
        ? {
            widthMode,
          }
        : {})}
      leadingContent={aggregationToggle}
      hideItemBadge={!!aggregationToggle}
      actions={
        actionProps ? <TraceDetailActions {...actionProps} /> : undefined
      }
      actionsMenu={
        actionProps ? (
          <TraceDetailActions {...actionProps} layout="menu" />
        ) : undefined
      }
    >
      <TraceDetailBody
        trace={trace.data}
        context="peek"
        keySuffix={peekObservationId}
        truncatedAtObservations={trace.truncatedAtObservations}
        showObservationOnly={aggregationLevel === "observation"}
        sessionScopeRequested={aggregationLevel === "session"}
      />
    </TablePeekView>
  );
};
