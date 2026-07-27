import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { useRouter } from "next/router";
import { useRef } from "react";
import {
  TraceDetailBody,
  traceDetailTitle,
} from "@/src/components/trace/TraceDetailBody";
import {
  TablePeekView,
  shouldClosePeekAfterDelete,
} from "@/src/components/table/peek";
import { TraceDetailActions } from "@/src/components/trace/TraceDetailActions";
import { resolvePeekTraceParams } from "@/src/components/table/peek/resolvePeekTraceParams";

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
  });

  const actionProps = trace.data
    ? {
        traceId: trace.data.id,
        projectId: trace.data.projectId,
        bookmarked: trace.data.bookmarked,
        isPublic: trace.data.public,
        name: trace.data.name,
        timestamp,
        onAfterDelete: (deletedTraceId: string) => {
          if (shouldClosePeekAfterDelete(peekIdRef.current, deletedTraceId)) {
            props.closePeek();
          }
        },
      }
    : null;

  return (
    <TablePeekView
      {...props}
      title={traceDetailTitle(trace.data, traceId)}
      actions={
        actionProps ? <TraceDetailActions {...actionProps} /> : undefined
      }
      actionsMenu={
        actionProps ? (
          <TraceDetailActions {...actionProps} layout="menu" />
        ) : undefined
      }
    >
      <TraceDetailBody trace={trace.data} context="peek" />
    </TablePeekView>
  );
};
