import { type z } from "zod";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { BatchTableNames, paginationZod } from "@langfuse/shared";
import { GenerationTableOptions } from "./utils/GenerationTableOptions";
import { getAllGenerations } from "@/src/server/api/routers/generations/db/getAllGenerationsSqlQuery";
import { getObservationsTableCount } from "@langfuse/shared/src/server";
import { applyCommentFilters } from "@langfuse/shared/src/server";
import { sanitizeLegacyTracingSearch } from "@/src/features/traces/server/legacyIoSearch";

const GetAllGenerationsInput = GenerationTableOptions.safeExtend({
  ...paginationZod,
});

export type GetAllGenerationsInput = z.infer<typeof GetAllGenerationsInput>;

export const getAllQueries = {
  all: protectedProjectProcedure
    .input(GetAllGenerationsInput)
    .query(async ({ input, ctx }) => {
      const search = sanitizeLegacyTracingSearch({
        searchQuery: input.searchQuery,
        searchType: input.searchType,
        tableName: BatchTableNames.Observations,
      });

      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: input.projectId,
        objectType: "OBSERVATION",
      });

      if (hasNoMatches) {
        return { generations: [], hasMore: false };
      }

      const { generations, hasMore } = await getAllGenerations({
        input: {
          ...input,
          filter: filterState,
          searchQuery: search.searchQuery ?? null,
          searchType: search.searchType ?? ["id"],
        },
        selectIOAndMetadata: false,
      });
      return { generations, hasMore };
    }),
  countAll: protectedProjectProcedure
    .input(GenerationTableOptions)
    .query(async ({ input, ctx }) => {
      const search = sanitizeLegacyTracingSearch({
        searchQuery: input.searchQuery,
        searchType: input.searchType,
        tableName: BatchTableNames.Observations,
      });

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
        searchQuery: search.searchQuery,
        searchType: search.searchType ?? ["id"],
        limit: 1,
        offset: 0,
      };
      const countQuery = await getObservationsTableCount(queryOpts);
      return {
        totalCount: countQuery,
      };
    }),
};
