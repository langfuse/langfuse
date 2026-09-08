import { TablePeekView } from "@/src/components/table/peek";
import { type usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import {
  TraceAggregationToggle,
  TraceDetailActions,
  TraceDetailBody,
} from "@/src/features/traces";
import { useTraceDetailMode } from "@/src/features/traces/hooks/useTraceDetailMode";

export function PeekTraceDetailContent({
  trace,
  actionProps,
  keySuffix,
  fallbackFromUnavailableSession,
  showUnavailableSessionMessage,
  ...peekProps
}: Omit<React.ComponentProps<typeof TablePeekView>, "children" | "title"> & {
  trace: ReturnType<typeof usePeekData>;
  actionProps: Omit<
    React.ComponentProps<typeof TraceDetailActions>,
    "layout"
  > | null;
  keySuffix: string | undefined;
  fallbackFromUnavailableSession: boolean;
  showUnavailableSessionMessage: boolean;
}) {
  const {
    mode: aggregationLevel,
    selectedObservation,
    setMode: setAggregationLevel,
    title,
    widthMode,
  } = useTraceDetailMode({
    trace: trace.data,
    fallbackFromUnavailableSession,
  });
  const isSessionScope =
    !!trace.data &&
    "sessionTraceEntries" in trace.data &&
    !!trace.data.sessionTraceEntries;
  const aggregationToggle = peekProps.isV4 ? (
    <TraceAggregationToggle
      aggregationLevel={aggregationLevel}
      canSelectSession={trace.canAggregateBySession}
      observationType={selectedObservation?.type ?? null}
      onAggregationLevelChange={setAggregationLevel}
    />
  ) : undefined;

  return (
    <TablePeekView
      {...peekProps}
      itemType={isSessionScope ? "SESSION" : peekProps.itemType}
      title={title}
      {...(peekProps.isV4 ? { widthMode } : {})}
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
      {showUnavailableSessionMessage && trace.isSessionScopeUnavailable ? (
        <div className="text-muted-foreground flex h-full items-center justify-center p-4 text-sm">
          This trace is not part of a session and cannot be opened in the v4
          detail view.
        </div>
      ) : (
        <TraceDetailBody
          trace={trace.data}
          context="peek"
          keySuffix={keySuffix}
          truncatedAtObservations={trace.truncatedAtObservations}
          showObservationOnly={aggregationLevel === "observation"}
          sessionScopeRequested={aggregationLevel === "session"}
          isError={trace.isError}
        />
      )}
    </TablePeekView>
  );
}
