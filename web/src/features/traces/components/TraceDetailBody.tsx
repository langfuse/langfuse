import { Trace } from "@/src/features/traces/components/Trace";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";

type TraceDetailData = NonNullable<
  ReturnType<typeof useTraceDetailData>["data"]
>;

/**
 * The trace detail body (`<Trace>`), shared by the peek and the standalone
 * page so the invocation isn't copy-pasted. Renders a skeleton until the data
 * arrives. `keySuffix` lets a caller force a remount when the focused item
 * changes (e.g. the observation peek keys on the observation id).
 */
export function TraceDetailBody({
  trace,
  context,
  keySuffix,
  truncatedAtObservations,
  showObservationOnly = false,
  sessionScopeRequested = false,
  isError = false,
}: {
  trace: TraceDetailData | undefined;
  context: "peek" | "fullscreen" | "annotation";
  keySuffix?: string;
  /** Observation cap this trace was loaded under, when it hit it. */
  truncatedAtObservations?: number;
  showObservationOnly?: boolean;
  sessionScopeRequested?: boolean;
  isError?: boolean;
}) {
  if (!trace) {
    if (isError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center">
          <p className="text-sm font-bold">Could not load trace</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Loading this trace failed. Reload the page to try again.
          </p>
        </div>
      );
    }
    return <Skeleton className="h-full w-full rounded-none" />;
  }
  const sessionTraceEntries =
    "sessionTraceEntries" in trace ? trace.sessionTraceEntries : undefined;
  const sessionGraphData =
    "sessionGraphData" in trace ? trace.sessionGraphData : undefined;
  const traceKey =
    sessionScopeRequested || sessionTraceEntries
      ? `session-${trace.sessionId ?? trace.id}`
      : trace.id;
  return (
    <Trace
      key={keySuffix ? `${traceKey}-${keySuffix}` : traceKey}
      trace={trace}
      scores={trace.scores}
      corrections={trace.corrections}
      projectId={trace.projectId}
      observations={trace.observations}
      sessionTraceEntries={sessionTraceEntries}
      sessionGraphData={sessionGraphData}
      context={context}
      truncatedAtObservations={truncatedAtObservations}
      showObservationOnly={showObservationOnly}
    />
  );
}
