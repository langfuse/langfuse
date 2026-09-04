import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { useRouter } from "next/router";
import { useRef } from "react";
import {
  TraceAggregationToggle,
  TraceDetailActions,
  TraceDetailBody,
} from "@/src/features/traces";
import { useTraceDetailMode } from "@/src/features/traces/hooks/useTraceDetailMode";
import {
  TablePeekView,
  shouldClosePeekAfterDelete,
} from "@/src/components/table/peek";
import { resolvePeekTraceParams } from "@/src/components/table/peek/resolvePeekTraceParams";
import { buildTracePath } from "@langfuse/shared";

export const TablePeekViewTraceDetail = (
  props: Omit<
    React.ComponentProps<typeof TablePeekView>,
    "children" | "title"
  > & {
    projectId: string;
  },
) => {
  const { projectId } = props;

  const router = useRouter();
  const { traceId, timestamp } = resolvePeekTraceParams({
    reader: "trace",
    peek: router.query.peek as string | undefined,
    traceId: router.query.traceId as string | undefined,
    timestamp: router.query.timestamp,
  });

  // Live handle on the peeked trace id: an in-flight delete that resolves after
  // K/J-navigation reads the CURRENT peek here (not the stale value captured
  // when the delete was fired), so it only closes the peek it actually deleted.
  const peekIdRef = useRef(traceId);
  peekIdRef.current = traceId;

  const trace = usePeekData({
    projectId,
    traceId,
    timestamp,
    ...(props.isV4
      ? {
          aggregationLevel:
            router.query.aggregation === "session"
              ? "session"
              : ("trace" as const),
          readPath: "v4" as const,
        }
      : {}),
  });
  const {
    mode: aggregationLevel,
    selectedObservation,
    setMode: setAggregationLevel,
    title,
    widthMode,
  } = useTraceDetailMode({ trace: trace.data });
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
          timestamp,
        }),
        name: trace.data.name,
        timestamp,
        onAfterDelete: (deletedTraceId: string) => {
          if (shouldClosePeekAfterDelete(peekIdRef.current, deletedTraceId)) {
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
      {trace.isSessionScopeUnavailable ? (
        <div className="text-muted-foreground flex h-full items-center justify-center p-4 text-sm">
          This trace is not part of a session and cannot be opened in the v4
          detail view.
        </div>
      ) : (
        <TraceDetailBody
          trace={trace.data}
          context="peek"
          truncatedAtObservations={trace.truncatedAtObservations}
          showObservationOnly={aggregationLevel === "observation"}
          sessionScopeRequested={aggregationLevel === "session"}
          isError={trace.isError}
        />
      )}
    </TablePeekView>
  );
};
