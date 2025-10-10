import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { filterAndValidateDbScoreList } from "@langfuse/shared";
import { type GetAllGenerationsInput } from "../getAllQueries";
import {
  getObservationsTableWithModelData,
  getObservationsWithModelDataFromEventsTable,
  getScoresForObservations,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

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
    limit: input.limit,
  };
  let generations = env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS
    ? await getObservationsWithModelDataFromEventsTable(queryOpts)
    : await getObservationsTableWithModelData(queryOpts);

  const scores = await getScoresForObservations({
    projectId: input.projectId,
    observationIds: generations.map((gen) => gen.id),
    excludeMetadata: true,
    includeHasMetadata: true,
  });

  const validatedScores = filterAndValidateDbScoreList({
    scores,
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
  };
}
