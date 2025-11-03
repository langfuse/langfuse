import { type z } from "zod/v4";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { paginationZod } from "@langfuse/shared";
import { EventsTableOptions } from "./utils/EventsTableOptions";
import {
  getObservationsCountFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
} from "@langfuse/shared/src/server";

const GetAllEventsInput = EventsTableOptions.extend({
  ...paginationZod,
});

export type GetAllEventsInput = z.infer<typeof GetAllEventsInput>;

export const getAllQueries = {
  all: protectedProjectProcedure
    .input(GetAllEventsInput)
    .query(async ({ input, ctx }) => {
      const queryOpts = {
        projectId: ctx.session.projectId,
        filter: input.filter ?? [],
        searchQuery: input.searchQuery ?? undefined,
        searchType: input.searchType,
        orderBy: input.orderBy,
        limit: input.limit,
        offset: input.page * input.limit,
        selectIOAndMetadata: true, // Include input/output truncated fields
      };

      const observations =
        await getObservationsWithModelDataFromEventsTable(queryOpts);

      return { observations };
    }),
  countAll: protectedProjectProcedure
    .input(GetAllEventsInput)
    .query(async ({ input, ctx }) => {
      const queryOpts = {
        projectId: ctx.session.projectId,
        filter: input.filter ?? [],
        searchQuery: input.searchQuery ?? undefined,
        searchType: input.searchType,
        orderBy: input.orderBy,
        limit: 1,
        offset: 0,
      };

      const totalCount = await getObservationsCountFromEventsTable(queryOpts);

      return {
        totalCount,
      };
    }),
};
