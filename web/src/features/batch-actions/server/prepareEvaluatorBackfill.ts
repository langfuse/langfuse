import type { ProjectAuthedContext } from "@/src/server/api/trpc";
import type { z } from "zod";
import {
  getDeterministicSamplingValue,
  getObservationsWithModelDataFromEventsTable,
  shouldSampleEvaluation,
  applyCommentFilters,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import type { PrepareObservationEvaluatorBackfillActionSchema } from "@/src/features/batch-actions/validation";

export async function prepareEvaluatorBackfill(
  input: z.infer<typeof PrepareObservationEvaluatorBackfillActionSchema>,
  ctx: ProjectAuthedContext,
) {
  const commentFilterResult = await applyCommentFilters({
    filterState: input.query.filter ?? [],
    prisma: ctx.prisma,
    projectId: input.projectId,
    objectType: "OBSERVATION",
  });
  if (commentFilterResult.hasNoMatches) return { query: null };

  const candidates = await getObservationsWithModelDataFromEventsTable({
    projectId: input.projectId,
    filter: [
      ...commentFilterResult.filterState,
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: input.timeRange.from,
      },
      {
        column: "startTime",
        type: "datetime",
        operator: "<=",
        value: input.timeRange.to,
      },
    ],
    searchQuery: input.query.searchQuery,
    searchType: input.query.searchType,
    orderBy: { column: "startTime", order: "DESC" },
    limit: Math.min(
      input.rowLimit,
      env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT,
    ),
    offset: 0,
    selectIOAndMetadata: false,
    dedupeBySpanId: true,
  });
  const selectedIds = candidates
    .filter((observation) =>
      shouldSampleEvaluation({
        samplingValue: getDeterministicSamplingValue(observation.id),
        samplingRate: input.sampling,
      }),
    )
    .map(({ id }) => id);

  return {
    query:
      selectedIds.length === 0
        ? null
        : {
            filter: [
              {
                column: "id" as const,
                type: "stringOptions" as const,
                operator: "any of" as const,
                value: selectedIds,
              },
            ],
            orderBy: { column: "startTime" as const, order: "DESC" as const },
            useEventsTable: true,
          },
  };
}
