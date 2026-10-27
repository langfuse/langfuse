import { useMemo } from "react";
import { useRouter } from "next/router";

import {
  buildTracePageContext,
  usePublishPageContext,
  type PageContextSurface,
} from "@/src/features/page-context";
import { useSelection } from "@/src/features/traces/contexts/SelectionProvider";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataProvider";

/**
 * Publishes the open trace, its selected observation and its notable steps as
 * the page context, so the assistant receives structured data rather than a
 * picture of the screen. Must run inside the trace's data and selection
 * providers.
 */
export function useTracePageContext(surface: PageContextSurface) {
  const { trace, observations, metricEmphasis, isPlaceholderData } =
    useTraceData();
  const { selectedNodeId, defaultObservationId } = useSelection();
  // The default selection is the root, which the trace already describes;
  // only an observation the user picked is a focus.
  const focusedObservationId =
    selectedNodeId !== defaultObservationId ? selectedNodeId : null;
  const { asPath } = useRouter();
  const { traceTotalCost, traceTotalDurationMs } = metricEmphasis.totals;

  const snapshot = useMemo(
    () =>
      // A placeholder is the previous trace kept on screen while the next one
      // loads; handing it to the assistant would describe the wrong trace.
      isPlaceholderData
        ? null
        : buildTracePageContext({
            trace,
            observations,
            totals: {
              totalCostUsd: traceTotalCost?.toNumber(),
              durationMs: traceTotalDurationMs,
            },
            selectedObservationId: focusedObservationId,
            surface,
            path: asPath,
          }),
    [
      asPath,
      isPlaceholderData,
      focusedObservationId,
      observations,
      surface,
      trace,
      traceTotalCost,
      traceTotalDurationMs,
    ],
  );

  usePublishPageContext(snapshot);
}
