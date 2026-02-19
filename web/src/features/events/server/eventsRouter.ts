import { type z } from "zod/v4";
import { z as zodSchema } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  type Observation,
  type OrderByState,
  paginationZod,
  timeFilter,
} from "@langfuse/shared";
import { EventsTableOptions } from "./types";
import {
  getEventList,
  getEventCount,
  getEventFilterOptions,
  getEventBatchIO,
} from "./eventsService";
import {
  instrumentAsync,
  getScoresAndCorrectionsForTraces,
  convertDateToClickhouseDateTime,
  getAgentGraphDataFromEventsTable,
  getObservationsForTraceFromEventsTable,
  MAX_OBSERVATIONS_PER_TRACE,
} from "@langfuse/shared/src/server";

import {
  AgentGraphDataSchema,
  type AgentGraphDataResponse,
} from "@/src/features/trace-graph-view/types";
import type * as opentelemetry from "@opentelemetry/api";

const GetAllEventsInput = EventsTableOptions.extend({
  ...paginationZod,
});

export type EventBatchIOOutput = Pick<
  Observation,
  "id" | "input" | "output" | "metadata"
>;

export type GetAllEventsInput = z.infer<typeof GetAllEventsInput>;

const GetEventFilterOptionsInput = zodSchema.object({
  projectId: zodSchema.string(),
  startTimeFilter: zodSchema.array(timeFilter).optional(),
});

export type GetEventFilterOptionsInput = z.infer<
  typeof GetEventFilterOptionsInput
>;

export const BatchIOInput = zodSchema.object({
  projectId: zodSchema.string(),
  observations: zodSchema.array(
    zodSchema.object({
      id: zodSchema.string(),
      traceId: zodSchema.string(),
    }),
  ),
  minStartTime: zodSchema.date(),
  maxStartTime: zodSchema.date(),
  truncated: zodSchema.boolean().optional(), // Defaults to true for performance
});

export type BatchIOInput = z.infer<typeof BatchIOInput>;

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

          return getEventList({
            projectId: ctx.session.projectId,
            filter: input.filter ?? [],
            searchQuery: input.searchQuery ?? undefined,
            searchType: input.searchType,
            orderBy: input.orderBy,
            page: input.page,
            limit: input.limit,
          });
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
      zodSchema.object({
        projectId: zodSchema.string(),
        startTimeFilter: zodSchema.array(timeFilter).optional(),
        hasParentObservation: zodSchema.boolean().optional(),
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
            hasParentObservation: input.hasParentObservation,
          });
        },
      );
    }),
  batchIO: protectedProjectProcedure
    .input(BatchIOInput)
    .query(async ({ input, ctx }) => {
      return instrumentAsync(
        { name: "get-event-batch-io-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          span.setAttribute("observation_count", input.observations.length);

          return getEventBatchIO({
            projectId: ctx.session.projectId,
            observations: input.observations,
            minStartTime: input.minStartTime,
            maxStartTime: input.maxStartTime,
            truncated: input.truncated,
          });
        },
      );
    }),
  /**
   * Fetch scores and corrections for a trace.
   * Used by the v4 trace detail view where trace data comes from events table.
   */
  scoresForTrace: protectedProjectProcedure
    .input(
      zodSchema.object({
        projectId: zodSchema.string(),
        traceId: zodSchema.string(),
        timestamp: zodSchema.date().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return instrumentAsync(
        { name: "get-events-scores-for-trace-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          span.setAttribute("trace_id", input.traceId);

          return getScoresAndCorrectionsForTraces({
            projectId: ctx.session.projectId,
            traceIds: [input.traceId],
            timestamp: input.timestamp,
          });
        },
      );
    }),
  /**
   * Fetch all observations for a trace from the events table.
   * Returns up to MAX_OBSERVATIONS_PER_TRACE observations.
   * Sets cutoffObservationsAfterMaxCount=true if trace exceeds the cap.
   */
  byTraceId: protectedProjectProcedure
    .input(
      zodSchema.object({
        projectId: zodSchema.string(),
        traceId: zodSchema.string(),
        timestamp: zodSchema.date().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return instrumentAsync(
        { name: "get-events-by-trace-id-trpc" },
        async (span) => {
          span.setAttribute("project_id", ctx.session.projectId);
          span.setAttribute("trace_id", input.traceId);

          const { observations, totalCount } =
            await getObservationsForTraceFromEventsTable({
              projectId: ctx.session.projectId,
              traceId: input.traceId,
              timestamp: input.timestamp,
            });

          return {
            observations,
            cutoffObservationsAfterMaxCount:
              totalCount > MAX_OBSERVATIONS_PER_TRACE,
          };
        },
      );
    }),
  /**
   * Fetch agent graph data from events table.
   * Used by v4 events-based trace detail view for graph visualization.
   * Returns same shape as traces.getAgentGraphData for frontend compatibility.
   */
  getAgentGraphData: protectedProjectProcedure
    .input(
      zodSchema.object({
        projectId: zodSchema.string(),
        traceId: zodSchema.string(),
        minStartTime: zodSchema.string(),
        maxStartTime: zodSchema.string(),
      }),
    )
    .query(
      async ({ input, ctx }): Promise<Required<AgentGraphDataResponse>[]> => {
        return instrumentAsync(
          { name: "get-events-agent-graph-data-trpc" },
          async (span) => {
            span.setAttribute("project_id", input.projectId);
            span.setAttribute("trace_id", input.traceId);

            const { traceId, minStartTime, maxStartTime } = input;

            const chMinStartTime = convertDateToClickhouseDateTime(
              new Date(minStartTime),
            );
            const chMaxStartTime = convertDateToClickhouseDateTime(
              new Date(maxStartTime),
            );

            const records = await getAgentGraphDataFromEventsTable({
              projectId: ctx.session.projectId,
              traceId,
              chMinStartTime,
              chMaxStartTime,
            });

            // Transform to AgentGraphDataResponse format
            // TODO: Extract this transformation logic into a shared utility
            // (duplicated from traces.getAgentGraphData in traces.ts)
            const result = records
              .map((r) => {
                const parsed = AgentGraphDataSchema.safeParse(r);
                if (!parsed.success) {
                  return null;
                }

                const data = parsed.data;
                const hasLangGraphData = data.step != null && data.node != null;
                const hasAgentData = data.type !== "EVENT";

                if (hasLangGraphData) {
                  return {
                    id: data.id,
                    node: data.node,
                    step: data.step,
                    parentObservationId: data.parent_observation_id || null,
                    name: data.name,
                    startTime: data.start_time,
                    endTime: data.end_time || undefined,
                    observationType: data.type,
                  };
                } else if (hasAgentData) {
                  return {
                    id: data.id,
                    node: data.name,
                    step: 0,
                    parentObservationId: data.parent_observation_id || null,
                    name: data.name,
                    startTime: data.start_time,
                    endTime: data.end_time || undefined,
                    observationType: data.type,
                  };
                }

                return null;
              })
              .filter((r): r is Required<AgentGraphDataResponse> => Boolean(r));

            return result;
          },
        );
      },
    ),
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
      if (f.value !== undefined) {
        span.setAttribute(f.column, String(f.value));
      }
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
