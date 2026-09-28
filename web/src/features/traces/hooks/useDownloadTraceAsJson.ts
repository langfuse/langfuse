import { useMemo } from "react";
import { toast } from "sonner";
import { StringParam, useQueryParam } from "use-query-params";

import { useReadPath } from "@/src/features/events";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { TRACE_DOWNLOAD_OMIT_LARGE_FIELDS_THRESHOLD } from "@/src/features/traces/constants/traceDownloadConfig";
import {
  downloadLegacyTraceAsJson,
  downloadServerTraceAsJson,
} from "@/src/features/traces/fns/downloadTrace";
import { dedupeObservationsById } from "@/src/features/traces/fns/treeBuilding";
import { useSelectedObservation } from "@/src/features/traces/hooks/useSelectedObservation";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";

export function useDownloadTraceAsJson({
  trace,
  observations: loadedObservations,
  traceContext,
}: {
  trace: { id: string; projectId: string; [key: string]: unknown };
  observations: ObservationReturnTypeWithMetadata[];
  traceContext: "fullscreen" | "peek" | "annotation";
}) {
  const { isV4 } = useReadPath();
  const capture = usePostHogClientCapture();
  const [selectedObservationId] = useQueryParam("observation", StringParam);
  const selected = useSelectedObservation({
    selectedNodeId: selectedObservationId ?? null,
    traceId: trace.id,
    projectId: trace.projectId,
    observations: loadedObservations,
  });
  const detachedObservation =
    selected.kind === "observation" && selected.isOutsideLoadedList
      ? selected.observation
      : null;
  const observations = useMemo(
    () =>
      dedupeObservationsById(
        detachedObservation
          ? [...loadedObservations, detachedObservation]
          : loadedObservations,
      ),
    [loadedObservations, detachedObservation],
  );

  return useWatchedPromiseCallback(async () => {
    capture("trace_detail:download_button_click", { traceContext, isV4 });
    try {
      if (!isV4) {
        downloadLegacyTraceAsJson({ trace, observations });
        return;
      }

      await downloadServerTraceAsJson({
        traceId: trace.id,
        projectId: trace.projectId,
      });

      if (observations.length >= TRACE_DOWNLOAD_OMIT_LARGE_FIELDS_THRESHOLD) {
        toast.warning(
          `Trace download excludes IO, metadata, toolDefinitions, and toolCalls for traces with ${TRACE_DOWNLOAD_OMIT_LARGE_FIELDS_THRESHOLD}+ observations.`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to download trace JSON",
      );
    }
  }, [isV4, observations, trace, capture, traceContext]);
}
