import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { filterAndValidateDbScoreList } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { type GetAllGenerationsInput } from "../getAllQueries";
import {
  createGenerationsQuery,
  getObservationsTable,
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
  if (queryClickhouse) {
    generations = await getObservationsTable({
      projectId: input.projectId,
      filter: input.filter,
      selectIOAndMetadata: selectIOAndMetadata,
      offset: input.page * input.limit,
      limit: input.limit,
    });
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
  }

  const scores = await prisma.score.findMany({
    where: {
      projectId: input.projectId,
      observationId: {
        in: generations.map((gen) => gen.id),
      },
    },
  });
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
