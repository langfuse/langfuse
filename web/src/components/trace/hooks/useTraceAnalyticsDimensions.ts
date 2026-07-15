import { useMemo } from "react";
import { useViewPreferences } from "@/src/components/trace/contexts/ViewPreferencesContext";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

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
  const { isBetaEnabled } = useV4Beta();

  return useMemo(
    () => ({ traceContext, isV4: isBetaEnabled }),
    [traceContext, isBetaEnabled],
  );
}
