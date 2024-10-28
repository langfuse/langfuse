import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { filterAndValidateDbScoreList } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { type GetAllGenerationsInput } from "../getAllQueries";
import {
  createGenerationsQuery,
  parseGetAllGenerationsInput,
  traceException,
  type FullObservations,
  type IOAndMetadataOmittedObservations,
} from "@langfuse/shared/src/server";

export async function getAllGenerations({
  input,
  selectIOAndMetadata,
}: {
  input: GetAllGenerationsInput;
  selectIOAndMetadata: boolean;
}) {
  const { searchCondition, filterCondition, orderByCondition, datetimeFilter } =
    parseGetAllGenerationsInput(input);

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

  const generations: FullObservations | IOAndMetadataOmittedObservations =
    selectIOAndMetadata
      ? ((await prisma.$queryRaw(query)) as FullObservations)
      : ((await prisma.$queryRaw(query)) as IOAndMetadataOmittedObservations);

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
