import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import {
  filterAndValidateDbScoreList,
  LISTABLE_SCORE_TYPES,
} from "@langfuse/shared";
import {
  getObservationsTableWithModelData,
  getScoresForObservations,
  traceException,
} from "@langfuse/shared/src/server";
import { type GetAllGenerationsInput } from "../getAllQueries";

export async function getAllGenerations({
  input,
  selectIOAndMetadata,
}: {
  input: GetAllGenerationsInput;
  selectIOAndMetadata: boolean;
}) {
  const queryOpts = {
    projectId: input.projectId,
    filter: input.filter,
    orderBy: input.orderBy,
    searchQuery: input.searchQuery ?? undefined,
    searchType: input.searchType,
    selectIOAndMetadata: selectIOAndMetadata,
    offset: input.page * input.limit,
    // Fetch one extra row to derive hasMore so the UI can paginate without
    // an eager countAll query (which cannot early-stop in ClickHouse).
    limit: input.limit + 1,
  };
  const fetchedGenerations = await getObservationsTableWithModelData(queryOpts);
  const hasMore = fetchedGenerations.length > input.limit;
  const generations = hasMore
    ? fetchedGenerations.slice(0, input.limit)
    : fetchedGenerations;

  const scores = await getScoresForObservations({
    projectId: input.projectId,
    observationIds: generations.map((gen) => gen.id),
    excludeMetadata: true,
    includeHasMetadata: true,
  });

  const validatedScores = filterAndValidateDbScoreList({
    scores,
    dataTypes: LISTABLE_SCORE_TYPES,
    includeHasMetadata: true,
    onParseError: traceException,
  });

  const fullGenerations = generations.map((generation) => {
    const filteredScores = aggregateScores(
      validatedScores.filter((s) => s.observationId === generation.id),
    );
    return {
      ...generation,
      scores: filteredScores,
    };
  });

  return {
    generations: fullGenerations,
    hasMore,
  };
}
