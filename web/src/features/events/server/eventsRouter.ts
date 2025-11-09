import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type OrderByState, paginationZod, timeFilter } from "@langfuse/shared";
import { EventsTableOptions } from "./types";
import {
  getEventList,
  getEventCount,
  getEventFilterOptions,
} from "./eventsService";
import { instrumentAsync } from "@langfuse/shared/src/server";
import type * as opentelemetry from "@opentelemetry/api";
import z from "zod/v4";

const GetAllEventsInput = EventsTableOptions.extend({
  ...paginationZod,
  limit: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z.coerce.number().nonnegative().lte(10000).default(50),
  ),
});

export type GetAllEventsInput = z.infer<typeof GetAllEventsInput>;

const GetEventFilterOptionsInput = z.object({
  projectId: z.string(),
  startTimeFilter: z.array(timeFilter).optional(),
});

export type GetEventFilterOptionsInput = z.infer<
  typeof GetEventFilterOptionsInput
>;

export const eventsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(GetAllEventsInput)
    .query(async ({ input, ctx }) => {
      return instrumentAsync(
        {
          name: "get-event-list-trpc",
        },
        async (span) => {
          addAttributesToSpan({ span, input, orderBy: input.orderBy });

          const events = await getEventList({
            projectId: ctx.session.projectId,
            filter: input.filter ?? [],
            searchQuery: input.searchQuery ?? undefined,
            searchType: input.searchType,
            orderBy: input.orderBy,
            page: input.page,
            limit: input.limit,
          });

          return {
            // we need to send the input and output as strings for the frontend as randomIO may be blocked by superjson/trpc
            // for security reasons. E.g. "property" fields are blocked by default.
            observations: events.observations.map((observation) => ({
              ...observation,
              input: observation.input
                ? JSON.stringify(observation.input)
                : null,
              output: observation.output
                ? JSON.stringify(observation.output)
                : null,
              metadata: observation.metadata
                ? JSON.stringify(observation.metadata)
                : null,
            })),
          };
        },
      );
    }),
  countAll: protectedProjectProcedure
    .input(GetAllEventsInput)
    .query(async ({ input, ctx }) => {
      return instrumentAsync(
        {
          name: "get-event-count-trpc",
        },
        async (span) => {
          addAttributesToSpan({ span, input, orderBy: input.orderBy });
          return getEventCount({
            projectId: ctx.session.projectId,
            filter: input.filter ?? [],
            searchQuery: input.searchQuery ?? undefined,
            searchType: input.searchType,
            orderBy: input.orderBy,
          });
        },
      );
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        startTimeFilter: z.array(timeFilter).optional(),
      }),
    )
    .query(async ({ input }) => {
      return instrumentAsync(
        {
          name: "get-event-filter-options-trpc",
        },

        async (span) => {
          addAttributesToSpan({ span, input, orderBy: undefined });
          return getEventFilterOptions({
            projectId: input.projectId,
            startTimeFilter: input.startTimeFilter,
          });
        },
      );
    }),
});

export const addAttributesToSpan = ({
  span,
  input,
  orderBy,
}: {
  span: opentelemetry.Span;
  input: GetAllEventsInput | GetEventFilterOptionsInput;
  orderBy?: OrderByState;
}) => {
  span.setAttribute("project_id", input.projectId);

  // Only process filter if it exists (not present in GetEventFilterOptionsInput)
  if ("filter" in input && input.filter) {
    const startTimeFilter = input.filter.find(
      (f) => f.column === "startTime" && f.type === "datetime",
    );
    const endTimeFilter = input.filter.find(
      (f) => f.column === "endTime" && f.type === "datetime",
    );

    if (startTimeFilter?.value && endTimeFilter?.value) {
      const durationMs = dateDiff(
        startTimeFilter.value as Date,
        endTimeFilter.value as Date,
      );
      // Convert milliseconds to minutes
      span.setAttribute("duration_minutes", durationMs / 60000);
    }

    input.filter.forEach((f) => {
      span.setAttribute(f.column, f.value.toString());
    });
  }

  if (orderBy) {
    span.setAttribute("order_by_column", orderBy.column);
    span.setAttribute("order_by_order", orderBy.order ?? "DESC");
  }
};

export const dateDiff = (date1: Date, date2: Date) => {
  return Math.abs(date2.getTime() - date1.getTime());
};
