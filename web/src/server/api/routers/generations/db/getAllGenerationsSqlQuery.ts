import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { filterAndValidateDbScoreList, type Score } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { type GetAllGenerationsInput } from "../getAllQueries";
import {
  createGenerationsQuery,
  getObservationsTableWithModelData,
  getScoresForObservations,
  parseGetAllGenerationsInput,
  traceException,
  type FullObservations,
  type IOAndMetadataOmittedObservations,
} from "@langfuse/shared/src/server";

export async function getAllGenerations({
  input,
  selectIOAndMetadata,
  queryClickhouse,
}: {
  input: GetAllGenerationsInput;
  selectIOAndMetadata: boolean;
  queryClickhouse?: boolean;
}) {
  const { searchCondition, filterCondition, orderByCondition, datetimeFilter } =
    parseGetAllGenerationsInput(input);

  let generations: FullObservations | IOAndMetadataOmittedObservations;
  let scores: Score[] = [];
  if (queryClickhouse) {
    generations = await getObservationsTableWithModelData({
      projectId: input.projectId,
      filter: input.filter,
      orderBy: input.orderBy,
      searchQuery: input.searchQuery ?? undefined,
      selectIOAndMetadata: selectIOAndMetadata,
      offset: input.page * input.limit,
      limit: input.limit,
    });
    scores = await getScoresForObservations(
      input.projectId,
      generations.map((gen) => gen.id),
    );
  } else {
    const query = createGenerationsQuery({
      projectId: input.projectId,
      page: input.page,
      limit: input.limit,
      searchCondition,
      filterCondition,
      orderByCondition,
      datetimeFilter,
      selectIOAndMetadata,
    });

    generations = selectIOAndMetadata
      ? ((await prisma.$queryRaw(query)) as FullObservations)
      : ((await prisma.$queryRaw(query)) as IOAndMetadataOmittedObservations);
    scores = await prisma.score.findMany({
      where: {
        projectId: input.projectId,
        observationId: {
          in: generations.map((gen) => gen.id),
        },
      },
    });
  }

  const validatedScores = filterAndValidateDbScoreList(scores, traceException);

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
    searchCondition,
    filterCondition,
    orderByCondition,
    datetimeFilter,
  };
}
