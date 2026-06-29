import {
  TablePeekView,
  shouldClosePeekAfterDelete,
} from "@/src/components/table/peek";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import {
  TraceDetailBody,
  traceDetailTitle,
} from "@/src/components/trace/TraceDetailBody";
import { TraceDetailActions } from "@/src/components/trace/TraceDetailActions";
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
  const peekId = router.query.peek as string | undefined;
  const timestampParam = router.query.timestamp as string | undefined;

  // Decode the timestamp parameter before parsing as Date
  // This handles cases where the timestamp might be URL-encoded
  const timestamp = timestampParam
    ? new Date(decodeURIComponent(timestampParam))
    : undefined;

  const traceId = router.query.traceId as string | undefined;

  // Live handle on the peeked observation's trace id: an in-flight delete that
  // resolves after K/J-navigation reads the CURRENT trace here, so it only
  // closes the peek when it still shows the trace that was deleted (LFE-10535).
  const traceIdRef = useRef(traceId);
  traceIdRef.current = traceId;

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
          if (shouldClosePeekAfterDelete(traceIdRef.current, deletedTraceId)) {
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
      <TraceDetailBody trace={trace.data} context="peek" keySuffix={peekId} />
    </TablePeekView>
  );
};
