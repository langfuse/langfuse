import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { filterAndValidateDbScoreList } from "@langfuse/shared";
import { type GetAllGenerationsInput } from "../getAllQueries";
import {
  getObservationsTableWithModelData,
  getScoresForObservations,
  traceException,
} from "@langfuse/shared/src/server";

export async function getAllGenerations({
  input,
  selectIOAndMetadata,
}: {
  input: GetAllGenerationsInput;
  selectIOAndMetadata: boolean;
}) {
  const generations = await getObservationsTableWithModelData({
    projectId: input.projectId,
    filter: input.filter,
    orderBy: input.orderBy,
    searchQuery: input.searchQuery ?? undefined,
    searchType: input.searchType,
    selectIOAndMetadata: selectIOAndMetadata,
    offset: input.page * input.limit,
    limit: input.limit,
  });

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
