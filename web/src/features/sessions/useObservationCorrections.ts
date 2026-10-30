import { useMemo } from "react";
import {
  filterAndValidateDbScoreList,
  ScoreDataTypeEnum,
  type ScoreDomain,
} from "@langfuse/shared";
import { getMostRecentCorrection } from "@/src/features/corrections";
import { type SessionTraceObservation } from "./SessionObservationIO";
import { api } from "@/src/utils/api";

export function useObservationCorrections({
  projectId,
  traceId,
  showCorrections,
  visibleObservations,
}: {
  projectId: string;
  traceId: string;
  showCorrections: boolean;
  visibleObservations: readonly SessionTraceObservation[] | undefined;
}) {
  const scoresQuery = api.events.scoresForTrace.useQuery(
    { projectId, traceId },
    {
      enabled:
        showCorrections &&
        !!visibleObservations?.some(
          (observation) =>
            !observation.inputTruncated && !observation.outputTruncated,
        ),
      staleTime: 60 * 1000,
    },
  );

  return useMemo(() => {
    const corrections = filterAndValidateDbScoreList({
      scores: scoresQuery.data ?? [],
      dataTypes: [ScoreDataTypeEnum.CORRECTION],
    });
    const grouped = new Map<string, ScoreDomain[]>();
    for (const correction of corrections) {
      // Synthetic session rows display trace I/O, whose corrections have no observation ID.
      const observationId = correction.observationId ?? `t-${traceId}`;
      const group = grouped.get(observationId) ?? [];
      group.push(correction);
      grouped.set(observationId, group);
    }

    const latestByObservation = new Map<string, ScoreDomain>();
    for (const [observationId, group] of grouped) {
      const latest = getMostRecentCorrection(group);
      if (latest) latestByObservation.set(observationId, latest);
    }
    return latestByObservation;
  }, [scoresQuery.data, traceId]);
}
