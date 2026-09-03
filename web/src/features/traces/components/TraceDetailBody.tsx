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
}: {
  trace: TraceDetailData | undefined;
  context: "peek" | "fullscreen" | "annotation";
  keySuffix?: string;
  /** Observation cap this trace was loaded under, when it hit it. */
  truncatedAtObservations?: number;
}) {
  if (!trace) return <Skeleton className="h-full w-full rounded-none" />;
  const sessionTraceEntries =
    "sessionTraceEntries" in trace ? trace.sessionTraceEntries : undefined;
  const traceKey = sessionTraceEntries
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
      context={context}
      truncatedAtObservations={truncatedAtObservations}
    />
  );
}
