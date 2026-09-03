import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { useRouter } from "next/router";
import { useRef } from "react";
import {
  TraceAggregationToggle,
  TraceDetailActions,
  TraceDetailBody,
  traceDetailTitle,
} from "@/src/features/traces";
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
  const aggregationLevel =
    router.query.aggregation === "session" ? "session" : "trace";
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
    ...(props.isV4 ? { aggregationLevel, readPath: "v4" as const } : {}),
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
  const aggregationToggle =
    props.isV4 && trace.canAggregateBySession ? (
      <TraceAggregationToggle
        aggregationLevel={aggregationLevel}
        onAggregationLevelChange={(nextAggregationLevel) => {
          const query = { ...router.query };
          if (nextAggregationLevel === "session") {
            query.aggregation = "session";
          } else {
            delete query.aggregation;
          }
          router.replace({ pathname: router.pathname, query }, undefined, {
            shallow: true,
          });
        }}
      />
    ) : undefined;

  return (
    <TablePeekView
      {...props}
      itemType={isSessionScope ? "SESSION" : props.itemType}
      title={isSessionScope ? "Session" : traceDetailTitle(trace.data, traceId)}
      actions={
        aggregationToggle || actionProps ? (
          <>
            {aggregationToggle}
            {actionProps ? <TraceDetailActions {...actionProps} /> : null}
          </>
        ) : undefined
      }
      actionsMenu={
        aggregationToggle || actionProps ? (
          <>
            {aggregationToggle}
            {actionProps ? (
              <TraceDetailActions {...actionProps} layout="menu" />
            ) : null}
          </>
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
        />
      )}
    </TablePeekView>
  );
};
