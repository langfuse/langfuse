import {
  TablePeekView,
  shouldClosePeekAfterDelete,
} from "@/src/components/table/peek";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { TraceDetailActions } from "@/src/features/traces/components/TraceDetailActions";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import { resolvePeekTraceParams } from "@/src/components/table/peek/resolvePeekTraceParams";
import { buildTracePath } from "@langfuse/shared";
import { useRouter } from "next/router";
import { useRef } from "react";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { TraceScopeToggle } from "@/src/features/traces/components/TraceScopeToggle/TraceScopeToggle";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";
import { resolveTraceScope } from "@/src/features/traces/fns/resolveTraceScope";

export const TablePeekViewObservationDetail = (
  props: Omit<
    React.ComponentProps<typeof TablePeekView>,
    "children" | "title"
  > & {
    projectId: string;
  },
) => {
  const router = useRouter();
  const internalFeaturesEnabled = useInternalFeaturesEnabled();

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
  const { canSelectSession, isSessionScope, showScopeToggle } =
    resolveTraceScope({
      internalFeaturesEnabled,
      isV4: !!props.isV4,
      isProjectMember,
      sessionId,
      aggregation: router.query.aggregation,
      context: "peek",
    });

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
      title={isSessionScope && sessionId ? sessionId : traceId}
      titleControl={
        showScopeToggle ? (
          <TraceScopeToggle
            value={isSessionScope ? "session" : "trace"}
            canSelectSession={canSelectSession}
            onValueChange={(next) => {
              const query = { ...router.query };
              if (next === "session") {
                query.aggregation = "session";
              } else {
                delete query.aggregation;
                if (
                  !trace.data?.observations.some(
                    (observation) => observation.id === query.observation,
                  )
                ) {
                  delete query.observation;
                }
              }
              return router.replace(
                { pathname: router.pathname, query },
                undefined,
                {
                  shallow: true,
                },
              );
            }}
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
