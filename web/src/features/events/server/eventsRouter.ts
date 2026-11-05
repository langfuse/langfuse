/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  auditedQuery,
  observationRefs,
  scoreRefs,
  refsIf,
  ref,
} from "@/src/features/audit-logs/server/auditedQuery";
import { type z, z as zodSchema } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "@/src/env.mjs";
import {
  getContextualFeatureFlags,
  hasInternalAccess,
} from "@/src/features/feature-flags/utils";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedGetEventsTraceProcedure,
  protectedGetSessionProcedure,
} from "@/src/server/api/trpc";
import {
  isoDateTime,
  type OrderByState,
  type SkillsAvailable,
  type SkillsResourceLoaded,
  normalizeOrderByForTable,
  paginationZod,
  singleFilterList,
  sessionTraceFilterSchema,
  timeFilter,
} from "@langfuse/shared";
import {
  toDomainArrayWithStringifiedMetadata,
  toDomainWithStringifiedMetadata,
  type MetadataDomainClient,
} from "@/src/utils/clientSideDomainTypes";
import { EventsCursorTableOptions, EventsTableOptions } from "./types";
import {
  getEventList,
  getEventListCursor,
  getEventCount,
  getEventFilterOptions,
  getEventMetadataValues,
  getEventBatchIO,
  EVENT_FILTER_OPTIONS_COLUMNS,
} from "./eventsService";
import { loadTraceTranscript } from "./loadTraceTranscript";
import {
  instrumentAsync,
  getCurrentSpan,
  getScoresAndCorrectionsForTraces,
  getAgentGraphDataFromEventsTable,
  getObservationsForTraceFromEventsTable,
  MAX_OBSERVATIONS_PER_TRACE,
  applyCommentFilters,
  getLatestSdkVersionInfoFromEvents,
} from "@langfuse/shared/src/server";

import { type AgentGraphDataResponse } from "@/src/features/trace-graph-view/types";
import { mapAgentGraphRecord } from "@/src/features/trace-graph-view/fns/mapAgentGraphRecord";

import type * as opentelemetry from "@opentelemetry/api";

const GetAllEventsInput = EventsTableOptions.safeExtend({
  ...paginationZod,
});

const GetSessionEventsInput = GetAllEventsInput.safeExtend({
  sessionId: zodSchema.string().min(1),
});

const GetEventsCursorInput = EventsCursorTableOptions.safeExtend({
  limit: paginationZod.limit,
  cursor: zodSchema
    .object({
      lastStartTimeTo: zodSchema.date(),
      lastTraceId: zodSchema.string(),
      lastId: zodSchema.string(),
    })
    .optional(),
});

export type EventBatchIOOutput = {
  id: string;
  input: string | null;
  output: string | null;
  metadata: MetadataDomainClient;
  skillsAvailable?: SkillsAvailable;
  skillsResourceLoaded?: SkillsResourceLoaded;
};

export type GetAllEventsInput = z.infer<typeof GetAllEventsInput>;

const GetEventFilterOptionsInput = zodSchema.object({
  projectId: zodSchema.string(),
  filter: singleFilterList.optional(),
  startTimeFilter: zodSchema.array(timeFilter).optional(),
  isRootObservation: zodSchema.boolean().optional(),
  hasParentObservation: zodSchema.boolean().optional(),
  columns: zodSchema
    .array(zodSchema.enum(EVENT_FILTER_OPTIONS_COLUMNS))
    .optional(),
  // When true, the response also carries the approximate total observation
  // count ("Total ≈ X") — uniq(span_id) over the same bulk facet scan, matching
  // `filter`. Sent only on the eager bulk request.
  includeApproxCount: zodSchema.boolean().optional(),
});

export type GetEventFilterOptionsInput = z.infer<
  typeof GetEventFilterOptionsInput
>;

const GetEventMetadataValuesInput = zodSchema.object({
  projectId: zodSchema.string(),
  key: zodSchema.string().min(1),
  startTimeFilter: zodSchema.array(timeFilter).optional(),
});

const BatchIOInput = zodSchema.object({
  projectId: zodSchema.string(),
  observations: zodSchema
    .array(
      zodSchema.object({
        id: zodSchema.string(),
        traceId: zodSchema.string(),
      }),
    )
    // Bounds the unbounded-LIMIT ClickHouse read; the largest legitimate
    // caller is one table page (max 50 rows), eval previews send one row.
    .max(500),
  minStartTime: zodSchema.date(),
  maxStartTime: zodSchema.date(),
  truncated: zodSchema.boolean().optional(), // Defaults to true for performance
  // Caps the chars of I/O (and of each metadata value) an untruncated read
  // ships. Bounded by the char limit above which the table cell stops
  // rendering anyway (IO_TABLE_CHAR_LIMIT).
  ioCharLimit: zodSchema.number().int().positive().max(10_000).optional(),
  includeToolCalls: zodSchema.boolean().optional(), // Defaults to false; tool-call arrays can be large
  includeSkills: zodSchema.boolean().optional(),
  // Opts into trace-level auth (public traces) in protectedGetEventsTraceProcedure
  traceId: zodSchema.string().optional(),
});
const SessionBatchIOInput = BatchIOInput.omit({ traceId: true }).extend({
  sessionId: zodSchema.string().min(1),
});

type BatchIOInput = z.infer<typeof BatchIOInput>;

export const eventsRouter = createTRPCRouter({
  all: auditedQuery(
    protectedProjectProcedure.input(GetAllEventsInput),
    { resourceType: "observation", action: "list" },
    async ({ input, ctx, audit }) => {
      const normalizedOrderBy = normalizeOrderByForTable({
        orderBy: input.orderBy,
        expectedTimeColumn: "startTime",
      });
      const span = getCurrentSpan();
      if (span) {
        addAttributesToSpan({ span, input, orderBy: normalizedOrderBy });
      }

      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: ctx.session.projectId,
        objectType: "OBSERVATION",
      });

      if (hasNoMatches) {
        return { observations: [], hasMore: false };
      }

      return instrumentAsync(
        {
          name: "get-event-list-trpc",
        },
        async (span) => {
          addAttributesToSpan({ span, input, orderBy: normalizedOrderBy });

          const events = await getEventList({
            projectId: ctx.session.projectId,
            filter: filterState,
            searchQuery: input.searchQuery ?? undefined,
            searchType: input.searchType,
            orderBy: normalizedOrderBy,
            page: input.page,
            limit: input.limit,
          });
          audit.refs(observationRefs(events.observations));
          audit.count(events.observations.length);
          return events;
        },
      );
    },
  ),
  sessionAll: auditedQuery(
    protectedGetSessionProcedure.input(GetSessionEventsInput),
    { resourceType: "observation", action: "list" },
    async ({ input, ctx, audit }) => {
      const filter = ctx.session.projectRole
        ? (input.filter ?? [])
        : (input.filter ?? []).filter(
            ({ column }) =>
              column !== "commentContent" && column !== "commentCount",
          );

      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: filter,
        prisma: ctx.prisma,
        projectId: input.projectId,
        objectType: "OBSERVATION",
      });

      if (hasNoMatches) {
        return { observations: [], hasMore: false };
      }

      const normalizedOrderBy = normalizeOrderByForTable({
        orderBy: input.orderBy,
        expectedTimeColumn: "startTime",
      });

      const events = await getEventList({
        projectId: input.projectId,
        filter: [
          ...filterState,
          {
            column: "sessionId",
            type: "string",
            operator: "=",
            value: input.sessionId,
          },
        ],
        searchQuery: input.searchQuery ?? undefined,
        searchType: input.searchType,
        orderBy: normalizedOrderBy,
        page: input.page,
        limit: input.limit,
      });
      audit.refs([
        ref("session", input.sessionId),
        ...observationRefs(events.observations),
      ]);
      audit.count(events.observations.length);
      return events;
    },
  ),
  listCursor: auditedQuery(
    protectedProjectProcedure.input(GetEventsCursorInput),
    { resourceType: "observation", action: "list" },
    async ({ input, ctx, audit }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: ctx.session.projectId,
        objectType: "OBSERVATION",
      });

      if (hasNoMatches) {
        return {
          observations: [],
          hasMore: false,
          nextCursor: undefined,
        };
      }

      return instrumentAsync(
        { name: "get-event-list-cursor-trpc" },
        async (span) => {
          addAttributesToSpan({
            span,
            input,
            orderBy: { column: "startTime", order: "DESC" },
          });

          const events = await getEventListCursor({
            projectId: ctx.session.projectId,
            filter: filterState,
            searchQuery: input.searchQuery ?? undefined,
            searchType: input.searchType,
            limit: input.limit,
            cursor: input.cursor,
          });
          audit.refs(observationRefs(events.observations));
          audit.count(events.observations.length);
          return events;
        },
      );
    },
  ),
  countAll: protectedProjectProcedure
    .input(EventsTableOptions)
    .query(async ({ input, ctx }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: ctx.session.projectId,
        objectType: "OBSERVATION",
      });

      if (hasNoMatches) {
        return { totalCount: 0, uniqueTraceCount: 0 };
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
            filter: input.filter,
            startTimeFilter: input.startTimeFilter,
            isRootObservation:
              input.isRootObservation ??
              (input.hasParentObservation !== undefined
                ? !input.hasParentObservation
                : undefined), // backward compat for legacy hasParentObservation filterOption
            columns: input.columns,
            includeApproxCount: input.includeApproxCount,
          });
        },
      );
    }),
  metadataValues: protectedProjectProcedure
    .input(GetEventMetadataValuesInput)
    .query(async ({ input }) => {
      return instrumentAsync(
        { name: "get-event-metadata-values-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          return getEventMetadataValues({
            projectId: input.projectId,
            key: input.key,
            startTimeFilter: input.startTimeFilter,
          });
        },
      );
    }),
  batchIO: auditedQuery(
    protectedGetEventsTraceProcedure.input(BatchIOInput),
    { resourceType: "observation", action: "read" },
    async ({ input, audit }) => {
      return instrumentAsync(
        { name: "get-event-batch-io-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          span.setAttribute("observation_count", input.observations.length);

          // the middleware only authorized access to input.traceId (which may
          // merely be public) — never fetch other traces' observations through it
          const observations = input.traceId
            ? input.observations.filter((o) => o.traceId === input.traceId)
            : input.observations;

          const batchIO = await getEventBatchIO({
            projectId: input.projectId,
            observations,
            minStartTime: input.minStartTime,
            maxStartTime: input.maxStartTime,
            truncated: input.truncated,
            ioCharLimit: input.ioCharLimit,
            includeToolCallFields: input.includeToolCalls,
            includeSkillFields: input.includeSkills,
          });

          audit.refs(observationRefs(batchIO));
          audit.count(batchIO.length);
          return batchIO.map(toDomainWithStringifiedMetadata);
        },
      );
    },
  ),
  sessionBatchIO: auditedQuery(
    protectedGetSessionProcedure.input(SessionBatchIOInput),
    { resourceType: "observation", action: "read" },
    async ({ input, audit }) => {
      return instrumentAsync(
        { name: "get-event-session-batch-io-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          span.setAttribute("session_id", input.sessionId);
          span.setAttribute("observation_count", input.observations.length);

          const batchIO = await getEventBatchIO({
            projectId: input.projectId,
            sessionId: input.sessionId,
            observations: input.observations,
            minStartTime: input.minStartTime,
            maxStartTime: input.maxStartTime,
            truncated: input.truncated,
            ioCharLimit: input.ioCharLimit,
            includeToolCallFields: input.includeToolCalls,
            includeSkillFields: input.includeSkills,
          });

          audit.refs([
            ref("session", input.sessionId),
            ...observationRefs(batchIO),
          ]);
          audit.count(batchIO.length);
          return batchIO.map(toDomainWithStringifiedMetadata);
        },
      );
    },
  ),
  experimentBatchIO: auditedQuery(
    protectedProjectProcedure.input(BatchIOInput),
    { resourceType: "observation", action: "read" },
    async ({ input, ctx, audit }) => {
      return instrumentAsync(
        { name: "get-experiment-batch-io-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          span.setAttribute("observation_count", input.observations.length);

          const batchIO = await getEventBatchIO({
            projectId: ctx.session.projectId,
            observations: input.observations,
            minStartTime: input.minStartTime,
            maxStartTime: input.maxStartTime,
            truncated: input.truncated,
            ioCharLimit: input.ioCharLimit,
            includeExperimentFields: true,
            includeToolCallFields: input.includeToolCalls,
            includeSkillFields: input.includeSkills,
          });

          audit.refs(observationRefs(batchIO));
          audit.count(batchIO.length);
          return batchIO.map(toDomainWithStringifiedMetadata);
        },
      );
    },
  ),
  /**
   * Fetch scores and corrections for a trace.
   * Used by the v4 trace detail view where trace data comes from events table.
   */
  scoresForTrace: auditedQuery(
    protectedGetEventsTraceProcedure.input(
      zodSchema.object({
        projectId: zodSchema.string(),
        traceId: zodSchema.string(),
        timestamp: zodSchema.date().optional(),
      }),
    ),
    { resourceType: "score", action: "list" },
    async ({ input, ctx, audit }) => {
      return instrumentAsync(
        { name: "get-events-scores-for-trace-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          span.setAttribute("trace_id", input.traceId);

          const scores = await getScoresAndCorrectionsForTraces({
            projectId: input.projectId,
            traceIds: [input.traceId],
            // we need traceTS here because we filter for that in DB
            // fallback to input in case trace unavailable - shouldn't happen
            timestamp: ctx.trace?.timestamp ?? input.timestamp,
          });
          audit.refs([ref("trace", input.traceId), ...scoreRefs(scores)]);
          audit.count(scores.length);
          return scores;
        },
      );
    },
  ),
  /**
   * Assemble the message transcript of a trace from its generations and tools,
   * see `loadTraceTranscript`. Available to internal users and Session Timeline
   * preview users, only where the events tables are written.
   */
  transcriptByTraceId: auditedQuery(
    protectedGetEventsTraceProcedure.input(
      zodSchema
        .object({
          projectId: zodSchema.string(),
          traceId: zodSchema.string(),
          timestamp: zodSchema.date().optional(),
          fallbackToRootIO: zodSchema.boolean().default(false),
        })
        .and(
          zodSchema.discriminatedUnion("context", [
            zodSchema.object({
              context: zodSchema.literal("session"),
              filter: sessionTraceFilterSchema.optional(),
            }),
            zodSchema.object({
              context: zodSchema.literal("other"),
              filter: zodSchema.never().optional(),
            }),
          ]),
        ),
    ),
    { resourceType: "trace", action: "read", idKey: "traceId" },
    async ({ input, ctx, audit }) => {
      const isSessionTimelineEnabled =
        getContextualFeatureFlags(ctx.session?.user, {
          projectId: input.projectId,
        })?.sessionViewV2Timeline === true;
      if (
        !isSessionTimelineEnabled &&
        !hasInternalAccess({
          email: ctx.session?.user?.email,
          isAdmin: ctx.session?.user?.admin === true,
          isExperimentalFeaturesEnabled:
            env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES === "true",
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Transcripts require internal access or the Session Timeline preview.",
        });
      }
      if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Transcripts need the events-backed trace view.",
        });
      }
      // The trace timestamp bounds the observation read; the trace is loaded
      // by the procedure, so the input is only a fallback.
      const timestamp = ctx.trace?.timestamp ?? input.timestamp;
      if (!timestamp) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Trace timestamp is required.",
        });
      }

      return instrumentAsync(
        { name: "get-transcript-by-trace-id-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          span.setAttribute("trace_id", input.traceId);

          const transcript = await loadTraceTranscript({
            ...input,
            timestamp,
          });
          audit.refs(
            (transcript.transcript?.threads ?? []).flatMap((thread) =>
              thread.currentTurn.messages.flatMap((message) =>
                refsIf("observation", message.observationId),
              ),
            ),
          );
          return transcript;
        },
      );
    },
  ),
  /**
   * Fetch all observations for a trace from the events table.
   * Returns up to MAX_OBSERVATIONS_PER_TRACE observations.
   * Sets cutoffObservationsAfterMaxCount=true if trace exceeds the cap.
   */
  byTraceId: auditedQuery(
    protectedGetEventsTraceProcedure.input(
      zodSchema.object({
        projectId: zodSchema.string(),
        traceId: zodSchema.string(),
        timestamp: zodSchema.date().optional(),
      }),
    ),
    { resourceType: "trace", action: "read", idKey: "traceId" },
    async ({ input, ctx, audit }) => {
      return instrumentAsync(
        { name: "get-events-by-trace-id-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          span.setAttribute("trace_id", input.traceId);

          const { observations, totalCount } =
            await getObservationsForTraceFromEventsTable({
              projectId: input.projectId,
              traceId: input.traceId,
              // we need traceTS here because we filter for that in DB
              // fallback to input in case trace unavailable - shouldn't happen
              timestamp: ctx.trace?.timestamp ?? input.timestamp,
            });
          audit.refs(observationRefs(observations));
          audit.count(observations.length);

          return {
            observations: toDomainArrayWithStringifiedMetadata(observations),
            cutoffObservationsAfterMaxCount:
              totalCount > MAX_OBSERVATIONS_PER_TRACE,
            // The cap the client was served under, so UI copy states the number
            // actually applied instead of keeping its own copy of it.
            maxObservationsPerTrace: MAX_OBSERVATIONS_PER_TRACE,
          };
        },
      );
    },
  ),
  /**
   * Fetch agent graph data from events table.
   * Used by v4 events-based trace detail view for graph visualization.
   * Returns same shape as traces.getAgentGraphData for frontend compatibility.
   */
  getAgentGraphData: auditedQuery(
    protectedGetEventsTraceProcedure.input(
      zodSchema.object({
        projectId: zodSchema.string(),
        traceId: zodSchema.string(),
        minStartTime: isoDateTime({ offset: true }),
        maxStartTime: isoDateTime({ offset: true }),
      }),
    ),
    { resourceType: "trace", action: "read", idKey: "traceId" },
    async ({ input, audit }): Promise<AgentGraphDataResponse[]> => {
      return instrumentAsync(
        { name: "get-events-agent-graph-data-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          span.setAttribute("trace_id", input.traceId);

          const { traceId, minStartTime, maxStartTime } = input;

          const records = await getAgentGraphDataFromEventsTable({
            projectId: input.projectId,
            traceId,
            minStartTime: new Date(minStartTime),
            maxStartTime: new Date(maxStartTime),
          });

          const result = records.flatMap((record) => {
            const mapped = mapAgentGraphRecord(record);
            if (!mapped) return [];
            const { traceId: _traceId, ...graphData } = mapped;
            return [graphData];
          });

          audit.refs(result.map((node) => ref("observation", node.id)));
          audit.count(result.length);
          return result;
        },
      );
    },
  ),
  /**
   * Get SDK metadata for a project.
   * Returns info about the SDK being used (name, version, language).
   */
  getSdkVersionInfo: protectedProjectProcedure
    .input(zodSchema.object({ projectId: zodSchema.string() }))
    .query(async ({ input }) => {
      return instrumentAsync(
        { name: "get-sdk-metadata-trpc" },
        async (span) => {
          span.setAttribute("project_id", input.projectId);
          return getLatestSdkVersionInfoFromEvents({
            projectId: input.projectId,
          });
        },
      );
    }),
});

const addAttributesToSpan = ({
  span,
  input,
  orderBy,
}: {
  span: opentelemetry.Span;
  input: GetAllEventsInput | GetEventFilterOptionsInput;
  orderBy?: OrderByState;
}) => {
  span.setAttribute("project_id", input.projectId);

  // Only process filters when supplied.
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

const dateDiff = (date1: Date, date2: Date) => {
  return Math.abs(date2.getTime() - date1.getTime());
};
