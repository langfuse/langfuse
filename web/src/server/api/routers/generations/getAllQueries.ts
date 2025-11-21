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
import { processCommentFilters } from "@/src/features/comments/server/commentFilterHelpers";

const GetAllGenerationsInput = GenerationTableOptions.extend({
  ...paginationZod,
});

export type GetAllGenerationsInput = z.infer<typeof GetAllGenerationsInput>;

export const getAllQueries = {
  all: protectedProjectProcedure
    .input(GetAllGenerationsInput)
    .query(async ({ input, ctx }) => {
      // Process comment filters and get matching observation IDs
      const { updatedFilterState, matchingObjectIds } =
        await processCommentFilters({
          filterState: input.filter ?? [],
          prisma: ctx.prisma,
          projectId: input.projectId,
          objectType: "OBSERVATION",
        });

      // Handle comment filter results
      let filterWithComments = updatedFilterState;
      if (matchingObjectIds !== null) {
        if (matchingObjectIds.length === 0) {
          // No observations match comment filters - return empty result
          return { generations: [] };
        }

        // Inject matching observation IDs as filter
        filterWithComments.push({
          type: "stringOptions",
          operator: "any of",
          column: "id",
          value: matchingObjectIds,
        });
      }

      const { generations } = await getAllGenerations({
        input: {
          ...input,
          filter: filterWithComments,
        },
        selectIOAndMetadata: false,
      });
      return { generations };
    }),
  countAll: protectedProjectProcedure
    .input(GetAllGenerationsInput)
    .query(async ({ input, ctx }) => {
      // Process comment filters and get matching observation IDs
      const { updatedFilterState, matchingObjectIds } =
        await processCommentFilters({
          filterState: input.filter ?? [],
          prisma: ctx.prisma,
          projectId: input.projectId,
          objectType: "OBSERVATION",
        });

      // Handle comment filter results
      let filterWithComments = updatedFilterState;
      if (matchingObjectIds !== null) {
        if (matchingObjectIds.length === 0) {
          // No observations match comment filters - return 0 count
          return { totalCount: 0 };
        }

        // Inject matching observation IDs as filter
        filterWithComments.push({
          type: "stringOptions",
          operator: "any of",
          column: "id",
          value: matchingObjectIds,
        });
      }

      const queryOpts = {
        projectId: ctx.session.projectId,
        filter: filterWithComments,
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
