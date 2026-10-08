import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { useRouter } from "next/router";
import { useRef } from "react";
import { TraceDetailActions } from "@/src/features/traces/components/TraceDetailActions";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import { TraceWaitingForArrival } from "@/src/features/traces/components/TraceWaitingForArrival";
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
    layout?: React.ComponentProps<typeof TraceDetailBody>["layout"];
  },
) => {
  const { projectId, layout, ...tablePeekViewProps } = props;

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

  const actionProps = {
    trace: trace.data,
    traceContext: "peek" as const,
    shareUrl: traceId
      ? buildTracePath({ projectId, traceId, timestamp })
      : undefined,
    timestamp,
    onAfterDelete: (deletedTraceId: string) => {
      if (shouldClosePeekAfterDelete(peekIdRef.current, deletedTraceId)) {
        tablePeekViewProps.closePeek();
      }
    },
  };

  return (
    <TablePeekView
      {...tablePeekViewProps}
      title={traceId}
      hideExpandToggle
      actions={<TraceDetailActions {...actionProps} />}
      actionsMenu={<TraceDetailActions {...actionProps} layout="menu" />}
    >
      {trace.isWaitingForTrace ? (
        <TraceWaitingForArrival />
      ) : (
        <TraceDetailBody
          trace={trace.data}
          context="peek"
          layout={layout}
          truncatedAtObservations={trace.truncatedAtObservations}
        />
      )}
    </TablePeekView>
  );
};
