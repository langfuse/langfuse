import { env } from "@/src/env.mjs";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import {
  AGGREGATABLE_SCORE_TYPES,
  filterAndValidateDbScoreList,
} from "@langfuse/shared";
import {
  getObservationsTableWithModelData,
  getObservationsWithModelDataFromEventsTable,
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
    limit: input.limit,
  };
  let generations =
    env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
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
    dataTypes: AGGREGATABLE_SCORE_TYPES,
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
