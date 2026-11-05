import { useCallback } from "react";
import {
  filterAndValidateDbScoreList,
  ScoreDataTypeArray,
} from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { toDomainArrayWithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";

export function useRefreshTraceScores({
  projectId,
  traceId,
  sessionId,
}: {
  projectId: string;
  traceId: string;
  sessionId: string | null | undefined;
}) {
  const utils = api.useUtils();
  const { isV4 } = useReadPath();

  return useCallback(async () => {
    if (
      isV4 &&
      sessionId &&
      utils.sessions.observationsForSessionFromEvents.getData({
        projectId,
        sessionId,
      })
    ) {
      await utils.events.scoresForTrace.invalidate({ projectId, traceId });
      const refreshed = await utils.events.scoresForTrace.fetch(
        { projectId, traceId },
        { staleTime: 0 },
      );
      const validated = filterAndValidateDbScoreList({
        scores: refreshed,
        dataTypes: ScoreDataTypeArray,
      });
      utils.sessions.observationsForSessionFromEvents.setData(
        { projectId, sessionId },
        (data) =>
          data && {
            ...data,
            scores: [
              ...data.scores.filter((score) => score.traceId !== traceId),
              ...toDomainArrayWithStringifiedMetadata(
                validated.filter((score) => score.dataType !== "CORRECTION"),
              ),
            ],
            corrections: [
              ...data.corrections.filter((score) => score.traceId !== traceId),
              ...validated.filter((score) => score.dataType === "CORRECTION"),
            ],
          },
      );
      return;
    }
    utils.traces.byIdWithObservationsAndScores.invalidate({
      projectId,
      traceId,
    });
    utils.events.scoresForTrace.invalidate({ projectId, traceId });
  }, [projectId, traceId, sessionId, isV4, utils]);
}
