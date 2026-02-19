import { type z } from "zod/v4";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { paginationZod } from "@langfuse/shared";
import { GenerationTableOptions } from "./utils/GenerationTableOptions";
import { getAllGenerations } from "@/src/server/api/routers/generations/db/getAllGenerationsSqlQuery";
import {
  getObservationsCountFromEventsTable,
  getObservationsTableCount,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { applyCommentFilters } from "@langfuse/shared/src/server";

const GetAllGenerationsInput = GenerationTableOptions.extend({
  ...paginationZod,
});

export type GetAllGenerationsInput = z.infer<typeof GetAllGenerationsInput>;

export const getAllQueries = {
  all: protectedProjectProcedure
    .input(GetAllGenerationsInput)
    .query(async ({ input, ctx }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: input.projectId,
        objectType: "OBSERVATION",
      });

      if (hasNoMatches) {
        return { generations: [] };
      }

      const { generations } = await getAllGenerations({
        input: {
          ...input,
          filter: filterState,
        },
        selectIOAndMetadata: false,
      });
      return { generations };
    }),
  countAll: protectedProjectProcedure
    .input(GetAllGenerationsInput)
    .query(async ({ input, ctx }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: input.projectId,
        objectType: "OBSERVATION",
      });

      if (hasNoMatches) {
        return { totalCount: 0 };
      }

      const queryOpts = {
        projectId: ctx.session.projectId,
        filter: filterState,
        limit: 1,
        offset: 0,
      };
      const countQuery =
        env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
          ? await getObservationsCountFromEventsTable(queryOpts)
          : await getObservationsTableCount(queryOpts);
      return {
        totalCount: countQuery,
      };
    }),
};
