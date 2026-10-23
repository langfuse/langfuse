import {
  TablePeekView,
  shouldClosePeekAfterDelete,
} from "@/src/components/table/peek";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { TraceDetailActions, TraceDetailBody } from "@/src/features/traces";
import { resolvePeekTraceParams } from "@/src/components/table/peek/resolvePeekTraceParams";
import { buildTracePath } from "@langfuse/shared";
import { useRouter } from "next/router";
import { useRef } from "react";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth";
import { ConnectedTraceScopeToggle } from "@/src/features/traces/components/ConnectedTraceScopeToggle/ConnectedTraceScopeToggle";

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
  });
  const isProjectMember = useIsAuthenticatedAndProjectMember(projectId);
  const sessionId = trace.data?.sessionId;
  const isSessionScope =
    props.isV4 &&
    isProjectMember &&
    router.query.aggregation === "session" &&
    !!sessionId;

  const actionProps = {
    trace: trace.data,
    traceContext: "peek" as const,
    shareUrl: traceId
      ? buildTracePath({
          projectId,
          traceId,
          aggregation:
            router.query.aggregation === "session" ? "session" : "trace",
          observationId:
            typeof router.query.traceId === "string"
              ? peekObservationId
              : undefined,
          timestamp:
            typeof router.query.traceId === "string" ? undefined : timestamp,
        })
      : undefined,
    timestamp,
    onAfterDelete: (deletedTraceId: string) => {
      if (shouldClosePeekAfterDelete(traceIdRef.current, deletedTraceId)) {
        props.closePeek();
      }
    },
  };

  return (
    <TablePeekView
      {...props}
      itemType={isSessionScope ? "SESSION" : props.itemType}
      title={isSessionScope ? sessionId : traceId}
      titleControl={
        props.isV4 ? (
          <ConnectedTraceScopeToggle
            value={isSessionScope ? "session" : "trace"}
            canSelectSession={isProjectMember && !!sessionId}
            observations={trace.data?.observations ?? []}
          />
        ) : undefined
      }
      hideExpandToggle
      preserveContentAcrossItems
      actions={
        <TraceDetailActions
          isPlaceholderData={trace.isPlaceholderData}
          {...actionProps}
        />
      }
      actionsMenu={
        <TraceDetailActions
          isPlaceholderData={trace.isPlaceholderData}
          {...actionProps}
          layout="menu"
        />
      }
    >
      <TraceDetailBody
        trace={trace.data}
        context="peek"
        keySuffix={peekObservationId}
        truncatedAtObservations={trace.truncatedAtObservations}
        isPlaceholderData={trace.isPlaceholderData}
      />
    </TablePeekView>
  );
};
