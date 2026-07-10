import { useMemo } from "react";

import { type PreviewData } from "@/src/features/evals/hooks/usePreviewData";
import { api } from "@/src/utils/api";
import { EvalTargetObject } from "@langfuse/shared";

/** The run-scope target: what kind of object the evaluator runs on. */
export type ScopeTargetObject = "trace" | "event" | "experiment";

/** Root observation (no parent) preferred, else the earliest by start time. */
export function pickRootObservation(
  observations: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (observations.length === 0) return null;
  return (
    observations.find((o) => !o.parentObservationId) ??
    [...observations].sort((a, b) => {
      const aTime = a.startTime instanceof Date ? a.startTime.getTime() : 0;
      const bTime = b.startTime instanceof Date ? b.startTime.getTime() : 0;
      return aTime - bTime;
    })[0]
  );
}

/**
 * Resolves the shared sample object every variable maps against, based on the
 * run-scope target:
 * - trace: the selected sample trace itself.
 * - event: the root observation of the sample trace (approximation; io is
 *   fetched separately because the trace query returns observation summaries).
 * - experiment: no preview in this prototype.
 */
export function useSourceObject({
  projectId,
  previewData,
  targetObject,
}: {
  projectId: string;
  previewData: PreviewData | null;
  targetObject: ScopeTargetObject;
}): Record<string, unknown> | null {
  const trace =
    previewData?.type === EvalTargetObject.TRACE ? previewData.trace : null;

  const firstObservation = useMemo(() => {
    if (!trace || targetObject !== "event") return null;
    return pickRootObservation(
      (trace.observations as Record<string, unknown>[] | undefined) ?? [],
    );
  }, [trace, targetObject]);

  const observationQuery = api.observations.byId.useQuery(
    {
      observationId: (firstObservation?.id as string) ?? "",
      startTime: (firstObservation?.startTime as Date | null) ?? null,
      traceId: trace?.id ?? "",
      projectId,
    },
    { enabled: Boolean(firstObservation && trace) },
  );

  if (!trace || targetObject === "experiment") return null;
  if (targetObject === "trace") {
    return trace as unknown as Record<string, unknown>;
  }
  return (observationQuery.data as Record<string, unknown> | undefined) ?? null;
}
