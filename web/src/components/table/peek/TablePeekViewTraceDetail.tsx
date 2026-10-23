import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { useRouter } from "next/router";
import { useRef } from "react";
import { TraceDetailActions } from "@/src/features/traces/components/TraceDetailActions";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import {
  TablePeekView,
  shouldClosePeekAfterDelete,
} from "@/src/components/table/peek";
import { resolvePeekTraceParams } from "@/src/components/table/peek/resolvePeekTraceParams";
import { buildTracePath } from "@langfuse/shared";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth";
import { ConnectedTraceScopeToggle } from "@/src/features/traces/components/ConnectedTraceScopeToggle/ConnectedTraceScopeToggle";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";

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
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
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
  const isProjectMember = useIsAuthenticatedAndProjectMember(projectId);
  const sessionId = trace.data?.sessionId;
  const isSessionScope =
    internalFeaturesEnabled &&
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
          timestamp,
          aggregation:
            router.query.aggregation === "session" ? "session" : "trace",
        })
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
      itemType={isSessionScope ? "SESSION" : tablePeekViewProps.itemType}
      title={isSessionScope ? sessionId : traceId}
      titleControl={
        props.isV4 && internalFeaturesEnabled ? (
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
        layout={layout}
        truncatedAtObservations={trace.truncatedAtObservations}
        isPlaceholderData={trace.isPlaceholderData}
      />
    </TablePeekView>
  );
};
