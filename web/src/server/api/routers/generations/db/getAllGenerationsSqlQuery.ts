import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { filterAndValidateDbScoreList } from "@langfuse/shared";
import { type ObservationView, prisma } from "@langfuse/shared/src/db";

import { type GetAllGenerationsInput } from "../getAllQueries";
import {
  createGenerationsQuery,
  parseGetAllGenerationsInput,
  traceException,
} from "@langfuse/shared/src/server";

type AdditionalObservationFields = {
  traceName: string | null;
  promptName: string | null;
  promptVersion: string | null;
  traceTags: Array<string>;
};

export type FullObservations = Array<
  AdditionalObservationFields & ObservationView
>;

export type IOAndMetadataOmittedObservations = Array<
  Omit<ObservationView, "input" | "output" | "metadata"> &
    AdditionalObservationFields
>;

export async function getAllGenerations({
  input,
  selectIOAndMetadata,
}: {
  input: GetAllGenerationsInput;
  selectIOAndMetadata: boolean;
}) {
  const generationsFilters = parseGetAllGenerationsInput(input);

  const query = createGenerationsQuery({
    ...input,
    ...generationsFilters,
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
    ...generationsFilters,
  };
}
