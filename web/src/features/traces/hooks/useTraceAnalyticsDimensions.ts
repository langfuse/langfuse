import { useMemo } from "react";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";

/**
 * Shared segmentation dimensions for every `trace_detail:*` analytics event:
 * - `isV4` — whether the trace view runs on the v4 (events/fast-mode) data
 *   path at the moment of the action; the headline v3-vs-v4 slice.
 * - `traceContext` — where the trace view is rendered
 *   (`fullscreen` | `peek` | `annotation`).
 *
 * Spread the result into every capture within the trace view so the
 * dimensions can never silently go missing on a new event. Must be used
 * within a ViewPreferencesProvider (i.e. inside <Trace/>).
 */
export function useTraceAnalyticsDimensions() {
  const { traceContext } = useViewPreferences();
  const { isV4 } = useReadPath();

  return useMemo(() => ({ traceContext, isV4: isV4 }), [traceContext, isV4]);
}
