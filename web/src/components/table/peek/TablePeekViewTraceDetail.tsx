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
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { TraceScopeToggle } from "@/src/features/traces/components/TraceScopeToggle/TraceScopeToggle";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";
import { resolveTraceScope } from "@/src/features/traces/fns/resolveTraceScope";

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
        layout={layout}
        truncatedAtObservations={trace.truncatedAtObservations}
        isPlaceholderData={trace.isPlaceholderData}
      />
    </TablePeekView>
  );
};
