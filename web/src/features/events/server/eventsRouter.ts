import { type z } from "zod/v4";
import { z as zodSchema } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod, timeFilter } from "@langfuse/shared";
import { EventsTableOptions } from "./types";
import {
  getEventList,
  getEventCount,
  getEventFilterOptions,
} from "./eventsService";

const GetAllEventsInput = EventsTableOptions.extend({
  ...paginationZod,
});

export type GetAllEventsInput = z.infer<typeof GetAllEventsInput>;

export const eventsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(GetAllEventsInput)
    .query(async ({ input, ctx }) => {
      return getEventList({
        projectId: ctx.session.projectId,
        filter: input.filter ?? [],
        searchQuery: input.searchQuery ?? undefined,
        searchType: input.searchType,
        orderBy: input.orderBy,
        page: input.page,
        limit: input.limit,
      });
    }),
  countAll: protectedProjectProcedure
    .input(GetAllEventsInput)
    .query(async ({ input, ctx }) => {
      return getEventCount({
        projectId: ctx.session.projectId,
        filter: input.filter ?? [],
        searchQuery: input.searchQuery ?? undefined,
        searchType: input.searchType,
        orderBy: input.orderBy,
      });
    }),
  filterOptions: protectedProjectProcedure
    .input(
      zodSchema.object({
        projectId: zodSchema.string(),
        startTimeFilter: zodSchema.array(timeFilter).optional(),
      }),
    )
    .query(async ({ input }) => {
      return getEventFilterOptions({
        projectId: input.projectId,
        startTimeFilter: input.startTimeFilter,
      });
    }),
});
