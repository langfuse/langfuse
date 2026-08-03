import { Trace } from "@/src/components/trace/Trace";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type useTraceDetailData } from "@/src/components/trace/useTraceDetailData";

type TraceDetailData = NonNullable<
  ReturnType<typeof useTraceDetailData>["data"]
>;

/** Detail-view title (`name: id`, or just the id), shared by the peek + page. */
export function traceDetailTitle(
  trace: { name?: string | null; id: string } | undefined,
  fallback?: string,
): string | undefined {
  if (!trace) return fallback;
  return trace.name ? `${trace.name}: ${trace.id}` : trace.id;
}

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
}: {
  trace: TraceDetailData | undefined;
  context: "peek" | "fullscreen" | "annotation";
  keySuffix?: string;
}) {
  if (!trace) return <Skeleton className="h-full w-full rounded-none" />;
  return (
    <Trace
      key={keySuffix ? `${trace.id}-${keySuffix}` : trace.id}
      trace={trace}
      scores={trace.scores}
      corrections={trace.corrections}
      projectId={trace.projectId}
      observations={trace.observations}
      context={context}
    />
  );
}
