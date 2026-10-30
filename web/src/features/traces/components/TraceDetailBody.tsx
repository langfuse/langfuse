import { Trace, type TraceProps } from "@/src/features/traces/components/Trace";
import { type useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";
import { useLatched } from "@/src/hooks/useLatched";

type TraceDetailData = NonNullable<
  ReturnType<typeof useTraceDetailData>["data"]
>;

/**
 * The trace detail body (`<Trace>`), shared by the peek and the standalone
 * page so the invocation isn't copy-pasted. A cold load renders `<Trace>` in
 * its loading state; while `isPlaceholderData`, `<Trace>` keeps the previous
 * trace on screen dimmed and inert. `keySuffix` lets a caller force a remount
 * when the focused item changes (e.g. the observation peek keys on the
 * observation id).
 */
export function TraceDetailBody({
  trace,
  context,
  keySuffix,
  truncatedAtObservations,
  isPlaceholderData = false,
  layout,
}: {
  trace: TraceDetailData | undefined;
  context: NonNullable<TraceProps["context"]>;
  keySuffix?: string;
  layout?: TraceProps["layout"];
  /** Observation cap this trace was loaded under, when it hit it. */
  truncatedAtObservations?: number;
  /** `trace` is the previous trace, kept while the next one loads. */
  isPlaceholderData?: boolean;
}) {
  // Held while placeholder: `keySuffix` already names the next item, and a key
  // mixing it with the previous trace's id would remount twice per switch.
  const traceKey = useLatched(
    keySuffix ? `${trace?.id}-${keySuffix}` : trace?.id,
    isPlaceholderData,
  );
  if (!trace) return <Trace isLoading context={context} layout={layout} />;
  return (
    <Trace
      key={traceKey}
      trace={trace}
      scores={trace.scores}
      corrections={trace.corrections}
      observations={trace.observations}
      projectId={trace.projectId}
      context={context}
      layout={layout}
      truncatedAtObservations={truncatedAtObservations}
      isPlaceholderData={isPlaceholderData}
    />
  );
}
