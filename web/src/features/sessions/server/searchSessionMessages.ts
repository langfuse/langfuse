import { type FilterState } from "@langfuse/shared";
import { getObservationsWithModelDataFromEventsTable } from "@langfuse/shared/src/server";

export const SESSION_MESSAGE_SEARCH_RESULT_LIMIT = 50;

export async function searchSessionMessages({
  projectId,
  sessionId,
  query,
  filter,
  limit,
  offset,
}: {
  projectId: string;
  sessionId: string;
  query: string;
  filter: FilterState;
  limit: number;
  offset: number;
}) {
  const observations = await getObservationsWithModelDataFromEventsTable({
    projectId,
    filter: [
      ...filter,
      {
        column: "sessionId",
        type: "string",
        operator: "=",
        value: sessionId,
      },
    ],
    searchQuery: query,
    searchType: ["content"],
    orderBy: { column: "startTime", order: "ASC" },
    limit: limit + 1,
    offset,
    selectIOAndMetadata: false,
    dedupeBySpanId: true,
  });
  const matchingObservations = observations.filter(
    (observation): observation is typeof observation & { traceId: string } =>
      Boolean(observation.traceId),
  );
  const hasMore = matchingObservations.length > limit;

  return {
    results: matchingObservations.slice(0, limit).map((observation) => ({
      traceId: observation.traceId,
      observationId: observation.id,
      observationName: observation.name,
      traceName: observation.traceName,
      startTime: observation.startTime,
    })),
    hasMore,
  };
}
