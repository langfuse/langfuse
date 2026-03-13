import { type z } from "zod/v4";
import { z as zodSchema } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  type JsonNested,
  type MetadataDomain,
  type Observation,
  type OrderByState,
  normalizeOrderByForTable,
  paginationZod,
  timeFilter,
} from "@langfuse/shared";
import { EventsTableOptions } from "./types";
import {
  getEventList,
  getEventCount,
  getEventFilterOptions,
  getEventBatchIO,
  getEventMetadataKeySuggestions,
} from "./eventsService";
import {
  instrumentAsync,
  getScoresAndCorrectionsForTraces,
  convertDateToClickhouseDateTime,
  getAgentGraphDataFromEventsTable,
  getObservationsForTraceFromEventsTable,
  MAX_OBSERVATIONS_PER_TRACE,
  applyCommentFilters,
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
  hasParentObservation: zodSchema.boolean().optional(),
});

const GetEventMetadataKeySuggestionsInput = GetEventFilterOptionsInput.omit({
  hasParentObservation: true,
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
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: ctx.session.projectId,
        objectType: "OBSERVATION",
      });

      if (hasNoMatches) {
        return { observations: [] };
      }

      return instrumentAsync(
        {
          name: "get-event-list-trpc",
        },
        async (span) => {
          const normalizedOrderBy = normalizeOrderByForTable({
            orderBy: input.orderBy,
            expectedTimeColumn: "startTime",
          });
          addAttributesToSpan({ span, input, orderBy: normalizedOrderBy });

          return getEventList({
            projectId: ctx.session.projectId,
            filter: filterState,
            searchQuery: input.searchQuery ?? undefined,
            searchType: input.searchType,
            orderBy: normalizedOrderBy,
            page: input.page,
            limit: input.limit,
          });
        },
      );
    }),
  countAll: protectedProjectProcedure
    .input(GetAllEventsInput)
    .query(async ({ input, ctx }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: ctx.session.projectId,
        objectType: "OBSERVATION",
      });

      if (hasNoMatches) {
        return { totalCount: 0 };
      }

      return instrumentAsync(
        {
          name: "get-event-count-trpc",
        },
        async (span) => {
          const normalizedOrderBy = normalizeOrderByForTable({
            orderBy: input.orderBy,
            expectedTimeColumn: "startTime",
          });
          addAttributesToSpan({ span, input, orderBy: normalizedOrderBy });
          return getEventCount({
            projectId: ctx.session.projectId,
            filter: filterState,
            searchQuery: input.searchQuery ?? undefined,
            searchType: input.searchType,
            orderBy: normalizedOrderBy,
          });
        },
      );
    }),
  filterOptions: protectedProjectProcedure
    .input(GetEventFilterOptionsInput)
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
  metadataKeySuggestions: protectedProjectProcedure
    .input(GetEventMetadataKeySuggestionsInput)
    .query(async ({ input }) => {
      return instrumentAsync(
        {
          name: "get-event-metadata-key-suggestions-trpc",
        },
        async (span) => {
          addAttributesToSpan({ span, input, orderBy: undefined });
          return getEventMetadataKeySuggestions({
            projectId: input.projectId,
            startTimeFilter: input.startTimeFilter,
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

          const observations = await getEventBatchIO({
            projectId: ctx.session.projectId,
            observations: input.observations,
            minStartTime: input.minStartTime,
            maxStartTime: input.maxStartTime,
            truncated: input.truncated,
          });

          return observations.map((observation) => ({
            ...observation,
            metadata: unflattenMetadataForTrpc(observation.metadata),
          }));
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
            observations: observations.map((observation) => ({
              ...observation,
              ...(observation.metadata !== undefined && {
                metadata: unflattenMetadataForTrpc(observation.metadata),
              }),
            })),
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

const CONFLICTS_KEY = "__langfuse_conflicts";

const isMetadataObject = (
  value: JsonNested | undefined,
): value is Record<string, JsonNested | undefined> =>
  value !== null &&
  value !== undefined &&
  typeof value === "object" &&
  !Array.isArray(value);

const cloneJsonNested = (
  value: JsonNested | undefined,
): JsonNested | undefined => {
  if (value === undefined || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonNested(item) as JsonNested);
  }

  if (isMetadataObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        cloneJsonNested(nestedValue),
      ]),
    );
  }

  return value;
};

const setMetadataConflict = (
  conflicts: Record<string, JsonNested | undefined>,
  path: string,
  value: JsonNested | undefined,
) => {
  conflicts[path] = cloneJsonNested(value);
};

const mergeMetadataObjectIntoTree = (
  target: Record<string, JsonNested | undefined>,
  source: Record<string, JsonNested | undefined>,
  basePath: string,
  conflicts: Record<string, JsonNested | undefined>,
) => {
  for (const [key, value] of Object.entries(source)) {
    const nextPath = `${basePath}.${key}`;
    const existing = target[key];

    if (existing === undefined) {
      target[key] = cloneJsonNested(value);
      continue;
    }

    if (isMetadataObject(existing) && isMetadataObject(value)) {
      mergeMetadataObjectIntoTree(existing, value, nextPath, conflicts);
      continue;
    }

    setMetadataConflict(conflicts, nextPath, value);
  }
};

export const unflattenMetadataForTrpc = (
  metadata: MetadataDomain | undefined,
): MetadataDomain => {
  if (!metadata) {
    return {};
  }

  const result: MetadataDomain = {};
  const conflicts: Record<string, JsonNested | undefined> = {};
  const entries = Object.entries(metadata).sort(
    ([leftKey], [rightKey]) =>
      leftKey.split(".").length - rightKey.split(".").length ||
      leftKey.localeCompare(rightKey),
  );

  for (const [key, value] of entries) {
    if (key === CONFLICTS_KEY) {
      setMetadataConflict(conflicts, key, value);
      continue;
    }

    const segments = key.split(".");

    if (segments.length === 1) {
      const existing = result[key];

      if (existing === undefined) {
        result[key] = cloneJsonNested(value);
      } else if (isMetadataObject(existing) && isMetadataObject(value)) {
        mergeMetadataObjectIntoTree(existing, value, key, conflicts);
      } else {
        setMetadataConflict(conflicts, key, value);
      }

      continue;
    }

    let current: Record<string, JsonNested | undefined> = result;

    for (let index = 0; index < segments.length - 1; index++) {
      const segment = segments[index];
      const currentPath = segments.slice(0, index + 1).join(".");
      const existing = current[segment];

      if (existing === undefined) {
        current[segment] = {};
      } else if (!isMetadataObject(existing)) {
        setMetadataConflict(conflicts, currentPath, existing);
        current[segment] = {};
      }

      current = current[segment] as Record<string, JsonNested | undefined>;
    }

    const leafKey = segments[segments.length - 1];
    const existing = current[leafKey];

    if (existing === undefined) {
      current[leafKey] = cloneJsonNested(value);
    } else if (isMetadataObject(existing) && isMetadataObject(value)) {
      mergeMetadataObjectIntoTree(existing, value, key, conflicts);
    } else {
      setMetadataConflict(conflicts, key, value);
    }
  }

  if (Object.keys(conflicts).length > 0) {
    result[CONFLICTS_KEY] = conflicts;
  }

  return result;
};
