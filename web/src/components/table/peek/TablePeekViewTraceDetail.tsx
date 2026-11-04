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
import { getTraceScopeTabs } from "@/src/features/traces/fns/getTraceScopeTabs";
import { getTraceScopeQuery } from "@/src/features/traces/fns/getTraceScopeQuery";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { resolveTraceScope } from "@/src/features/traces/fns/resolveTraceScope";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";

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
  const unifiedTraceSessionViewEnabled = useIsFeatureEnabled(
    "unifiedTraceSessionView",
    { projectId },
  );
  const { isV4 } = useReadPath();
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
      unifiedTraceSessionViewEnabled,
      isV4,
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
      titleTabs={
        showScopeToggle
          ? getTraceScopeTabs({
              value: isSessionScope ? "session" : "trace",
              canSelectSession,
              onValueChange: (next) => {
                const query = getTraceScopeQuery(
                  router.query,
                  next,
                  trace.data?.observations,
                );
                return router.replace(
                  { pathname: router.pathname, query },
                  undefined,
                  {
                    shallow: true,
                  },
                );
              },
            })
          : undefined
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
